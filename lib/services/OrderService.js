// lib/services/OrderService.js
//
// Central service for the purchase flow:
//   browse events    -> listPublishedEvents / getEventBySlug
//   create order     -> validates + atomically reserves inventory via RPC
//   pay order        -> PaymentService + creates ticket holders on success
//   inspect          -> own orders / tickets
//
// Rules enforced here:
//   * Never trust client-supplied prices/totals/payment status.
//   * Inventory is reserved transactionally on the database (create_order_service).
//   * Failed payments release inventory and keep records for audit.
//   * Ticket holders are only created after a verified successful payment.
'use strict';

const crypto = require('crypto');
const supabase = require('../supabase');
const PaymentService = require('../payments/PaymentService');
const { ApiError } = require('../errors');

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

function randomTicketCode() {
  let out = '';
  for (let i = 0; i < 8; i += 1) {
    out += CODE_CHARS[crypto.randomInt(0, CODE_CHARS.length)];
  }
  return 'AP-' + out;
}

function mapRpcError(error) {
  const msg = error && error.message ? String(error.message) : '';
  const map = {
    EVENT_NOT_FOUND: 404,
    EVENT_NOT_AVAILABLE: 409,
    TICKET_NOT_FOUND: 404,
    TICKET_INACTIVE: 409,
    TICKET_SALES_NOT_STARTED: 409,
    TICKET_SALES_ENDED: 409,
    INSUFFICIENT_INVENTORY: 409,
    INVALID_QUANTITY: 400,
    INVALID_PAYLOAD: 400,
    UNAUTHORIZED: 403
  };
  for (const code of Object.keys(map)) {
    if (msg.includes(code)) return new ApiError(map[code], code);
  }
  console.error('create_order_service rpc failed:', error);
  return new ApiError(400, 'ORDER_CREATION_FAILED', 'Order could not be created.');
}

function requireActiveWindow(tt) {
  const now = Date.now();
  if (tt.sales_start) {
    const s = new Date(tt.sales_start).getTime();
    if (isNaN(s) || s > now) throw new ApiError(409, 'TICKET_SALES_NOT_STARTED', 'Ticket sales have not started yet.');
  }
  if (tt.sales_end) {
    const e = new Date(tt.sales_end).getTime();
    if (isNaN(e) || e < now) throw new ApiError(409, 'TICKET_SALES_ENDED', 'Ticket sales have ended.');
  }
}

function validateAttendee(a, index) {
  const name = typeof a.name === 'string' ? a.name.trim().replace(/\s+/g, ' ').slice(0, 120) : '';
  if (name.length < 2) {
    throw new ApiError(422, 'INVALID_ATTENDEE', 'Attendee ' + (index + 1) + ': name is required.');
  }
  let age = null;
  if (a.age !== undefined && a.age !== null && a.age !== '') {
    age = Number(a.age);
    if (!Number.isInteger(age) || age < 0 || age > 120) {
      throw new ApiError(422, 'INVALID_ATTENDEE', 'Attendee ' + (index + 1) + ': age must be 0–120.');
    }
  }
  const gender = typeof a.gender === 'string' ? a.gender.trim().slice(0, 20) : '';
  const phone = typeof a.phone === 'string' ? a.phone.trim().slice(0, 20) : '';
  return { name, age, gender, phone };
}

async function listPublishedEvents() {
  const client = supabase.getAdminClient();
  const { data, error } = await client
    .from('events')
    .select('id, name, slug, description, venue, address, event_date, start_time, end_time, cover_image, status, created_at')
    .eq('status', 'published')
    .order('event_date', { ascending: true });

  if (error) throw error;

  const { data: availability, error: aErr } = await client
    .from('public_ticket_availability')
    .select('id, event_id, name, description, price, currency, admission_count, total_quantity, sold_quantity, remaining_quantity, sales_start, sales_end, status');

  if (aErr) throw aErr;

  const byEvent = {};
  for (const row of availability || []) {
    if (!byEvent[row.event_id]) byEvent[row.event_id] = [];
    byEvent[row.event_id].push(row);
  }

  return (data || []).map((ev) => ({
    id: ev.id,
    name: ev.name,
    slug: ev.slug,
    description: ev.description,
    venue: ev.venue,
    address: ev.address,
    event_date: ev.event_date,
    start_time: ev.start_time,
    end_time: ev.end_time,
    cover_image: ev.cover_image,
    status: ev.status,
    ticket_types: (byEvent[ev.id] || []).map((tt) => ({
      id: tt.id,
      name: tt.name,
      description: tt.description,
      price: Number(tt.price),
      currency: tt.currency,
      admission_count: tt.admission_count,
      remaining_quantity: Number(tt.remaining_quantity),
      sold_quantity: Number(tt.sold_quantity),
      total_quantity: Number(tt.total_quantity),
      sales_start: tt.sales_start,
      sales_end: tt.sales_end
    }))
  }));
}

async function getEventBySlug(slug) {
  const client = supabase.getAdminClient();
  const { data: event, error } = await client
    .from('events')
    .select('id, name, slug, description, venue, address, event_date, start_time, end_time, cover_image, status, created_at')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  if (!event) throw new ApiError(404, 'EVENT_NOT_FOUND');
  if (event.status !== 'published') throw new ApiError(404, 'EVENT_NOT_FOUND');

  const { data: availability, error: aErr } = await client
    .from('public_ticket_availability')
    .select('*')
    .eq('event_id', event.id);
  if (aErr) throw aErr;

  return {
    ...event,
    ticket_types: (availability || []).map((tt) => ({
      id: tt.id,
      name: tt.name,
      description: tt.description,
      price: Number(tt.price),
      currency: tt.currency,
      admission_count: tt.admission_count,
      remaining_quantity: Number(tt.remaining_quantity),
      sold_quantity: Number(tt.sold_quantity),
      total_quantity: Number(tt.total_quantity),
      sales_start: tt.sales_start,
      sales_end: tt.sales_end
    }))
  };
}

/**
 * Creates a pending order, atomically reserves inventory, and creates the
 * provider payment intent.
 */
async function createOrder(user, payload) {
  const client = supabase.getAdminClient();
  const eventId = payload && payload.event_id ? String(payload.event_id) : '';
  const items = Array.isArray(payload.items) ? payload.items : [];
  const attendeeData = Array.isArray(payload.attendee_data) ? payload.attendee_data : [];

  if (!eventId) throw new ApiError(400, 'INVALID_PAYLOAD', 'event_id is required.');
  if (!items.length) throw new ApiError(400, 'INVALID_PAYLOAD', 'At least one ticket is required.');

  // --- Pre-validations (authoritative checks + reservation happen in RPC) ---
  for (const item of items) {
    const ttId = item && item.ticket_type_id ? String(item.ticket_type_id) : '';
    const qty = Number(item && item.quantity);
    if (!ttId) throw new ApiError(400, 'INVALID_PAYLOAD', 'Each item needs ticket_type_id.');
    if (!Number.isInteger(qty) || qty < 1 || qty > 99) {
      throw new ApiError(400, 'INVALID_QUANTITY', 'Quantity must be an integer between 1 and 99.');
    }
  }

  const ticketIds = items.map((i) => String(i.ticket_type_id));
  const { data: tts, error: tErr } = await client
    .from('ticket_types')
    .select('id, event_id, name, price, admission_count, status, total_quantity, sold_quantity, sales_start, sales_end')
    .in('id', ticketIds);
  if (tErr) throw tErr;

  const ttMap = {};
  for (const tt of tts || []) ttMap[tt.id] = tt;

  let totalExpectedAttendees = 0;
  for (const item of items) {
    const tt = ttMap[String(item.ticket_type_id)];
    if (!tt) throw new ApiError(404, 'TICKET_NOT_FOUND');
    if (tt.event_id !== eventId) throw new ApiError(404, 'TICKET_NOT_FOUND');
    if (tt.status !== 'active') throw new ApiError(409, 'TICKET_INACTIVE');
    if ((tt.total_quantity - tt.sold_quantity) < Number(item.quantity)) {
      throw new ApiError(409, 'INSUFFICIENT_INVENTORY');
    }
    requireActiveWindow(tt);
    totalExpectedAttendees += tt.admission_count * Number(item.quantity);
  }

  // Validate attendee data matches expected admission count.
  const expectedByTt = {};
  for (const item of items) {
    const tt = ttMap[String(item.ticket_type_id)];
    const expected = tt.admission_count * Number(item.quantity);
    if (!expectedByTt[tt.id]) expectedByTt[tt.id] = 0;
    expectedByTt[tt.id] += expected;
  }

  const sanitizedAttendees = [];
  let suppliedTotal = 0;
  const suppliedByTt = {};
  for (const group of attendeeData) {
    const ttId = String(group && group.ticket_type_id || '');
    if (!expectedByTt[ttId]) throw new ApiError(422, 'INVALID_ATTENDEE_COUNT');
    const list = Array.isArray(group.attendees) ? group.attendees : [];
    if (suppliedByTt[ttId]) suppliedByTt[ttId] += list.length;
    else suppliedByTt[ttId] = list.length;
    suppliedTotal += list.length;
    const cleaned = list.map((a, i) => validateAttendee(a || {}, i));
    sanitizedAttendees.push({ ticket_type_id: ttId, quantity: Number(group.quantity || 0), attendees: cleaned });
  }

  for (const ttId of Object.keys(expectedByTt)) {
    if ((suppliedByTt[ttId] || 0) !== expectedByTt[ttId]) {
      throw new ApiError(422, 'INVALID_ATTENDEE_COUNT', 'Attendee count must match the tickets selected.');
    }
  }
  if (suppliedTotal !== totalExpectedAttendees) {
    throw new ApiError(422, 'INVALID_ATTENDEE_COUNT', 'Attendee count must match the tickets selected.');
  }

  // --- Atomic order creation + inventory reservation ---
  const { data: rpcData, error: rpcError } = await client.rpc('create_order_service', {
    p_user_id: user.id,
    p_event_id: eventId,
    p_items: items.map((i) => ({ ticket_type_id: String(i.ticket_type_id), quantity: Number(i.quantity) })),
    p_attendee_data: sanitizedAttendees
  });
  if (rpcError) throw mapRpcError(rpcError);
  if (!rpcData || !rpcData.order_id) throw new ApiError(500, 'ORDER_CREATION_FAILED');

  const orderId = rpcData.order_id;

  // --- Create provider payment intent (mock for now) ---
  const provider = PaymentService.getProvider('mock');
  const paymentBase = {
    order_id: orderId,
    provider: 'mock',
    amount: Number(rpcData.total_amount),
    currency: 'INR',
    status: 'created',
    provider_metadata: {}
  };
  const intent = await provider.createPayment({ payment: paymentBase });
  paymentBase.provider_order_id = intent.provider_order_id || null;
  paymentBase.provider_payment_id = intent.provider_payment_id || null;
  paymentBase.provider_metadata = intent.metadata || {};

  const { data: paymentRow, error: pErr } = await client
    .from('payments')
    .insert(paymentBase)
    .select()
    .single();
  if (pErr) {
    // Roll back reserved inventory if payment intent creation fails.
    await client.rpc('release_order_inventory', { p_order_id: orderId });
    throw pErr;
  }

  return {
    order: {
      id: orderId,
      event_id: eventId,
      total_amount: Number(rpcData.total_amount),
      currency: rpcData.currency,
      status: 'pending',
      items: (rpcData.items || []).map((it) => ({
        ticket_type_id: it.ticket_type_id,
        name: it.name,
        quantity: it.quantity,
        unit_price: Number(it.unit_price),
        subtotal: Number(it.subtotal),
        admission_count: it.admission_count
      }))
    },
    payment: {
      id: paymentRow.id,
      provider: paymentRow.provider,
      amount: Number(paymentRow.amount),
      currency: paymentRow.currency,
      status: paymentRow.status,
      provider_payment_id: paymentRow.provider_payment_id
    }
  };
}

/**
 * Finalises a pending order after mock payment. On a verified capture the
 * order becomes PAID and ticket-holder records + codes are created. On a
 * simulated failure the order FAILS and inventory is released.
 */
async function payOrder(user, orderId, { simulate } = {}) {
  const client = supabase.getAdminClient();

  const { data: order, error: oErr } = await client
    .from('orders')
    .select('id, user_id, event_id, status, total_amount, currency, attendee_data')
    .eq('id', String(orderId))
    .eq('user_id', user.id)
    .maybeSingle();
  if (oErr) throw oErr;
  if (!order) throw new ApiError(404, 'ORDER_NOT_FOUND');

  // Idempotent re-verify.
  if (order.status === 'paid' || order.status === 'cancelled' || order.status === 'refunded' ||
      order.status === 'partially_refunded') {
    const existing = await getOrder(user, order.id);
    return { finalized: true, order: existing.order, tickets: existing.tickets };
  }

  const { data: payment, error: payErr } = await client
    .from('payments')
    .select('*')
    .eq('order_id', order.id)
    .maybeSingle();
  if (payErr) throw payErr;
  if (!payment) throw new ApiError(404, 'PAYMENT_NOT_FOUND');

  // Allow devs to choose the mock outcome (only while payment is 'created').
  if (payment.status === 'created' && simulate) {
    const meta = { ...(payment.provider_metadata || {}), simulate: simulate === 'failure' ? 'failure' : 'success' };
    await client.from('payments').update({ provider_metadata: meta }).eq('id', payment.id);
    payment.provider_metadata = meta;
  }

  if (payment.status === 'failed') {
    await failOrder(client, order, payment);
    return { finalized: true, success: false, code: 'PAYMENT_FAILED', order: (await getOrder(user, order.id)).order, tickets: [] };
  }

  const provider = PaymentService.getProvider(payment.provider);
  let result;
  try {
    result = await provider.verifyPayment({ payment });
  } catch (err) {
    throw new ApiError(502, 'PAYMENT_VERIFICATION_FAILED', 'Payment could not be verified.');
  }

  if (result && result.verified) {
    return await captureOrder(client, user, order, payment);
  }

  if (payment.status === 'created') {
    await client.from('payments').update({ status: 'failed' }).eq('id', payment.id);
  }
  await failOrder(client, order, payment);
  return { finalized: true, success: false, code: 'PAYMENT_FAILED', order: (await getOrder(user, order.id)).order, tickets: [] };
}

async function captureOrder(client, user, order, payment) {
  await client.from('payments').update({ status: 'captured', paid_at: new Date().toISOString() }).eq('id', payment.id);
  await client.from('orders').update({ status: 'paid' }).eq('id', order.id);

  const tickets = await createTicketHolders(client, order);
  const fresh = await getOrder(user, order.id);
  return { finalized: true, success: true, order: fresh.order, tickets };
}

async function failOrder(client, order, payment) {
  // Mark payment failed + order failed, release inventory, drop any holders.
  if (payment && payment.status !== 'failed') {
    await client.from('payments').update({ status: 'failed' }).eq('id', payment.id);
  }
  await client.from('orders').update({ status: 'failed' }).eq('id', order.id);
  await client.rpc('release_order_inventory', { p_order_id: order.id });
  const { error } = await client.rpc('delete_order_ticket_holders', { p_order_id: order.id });
  if (error) console.warn('delete_order_ticket_holders failed:', error.message);
}

async function createTicketHolders(client, order) {
  const { data: items, error: iErr } = await client
    .from('order_items')
    .select('id, ticket_type_id, quantity')
    .eq('order_id', order.id);
  if (iErr) throw iErr;

  const itemByTt = {};
  for (const it of items || []) {
    if (!itemByTt[it.ticket_type_id]) itemByTt[it.ticket_type_id] = [];
    itemByTt[it.ticket_type_id].push(it);
  }

  const groups = Array.isArray(order.attendee_data) ? order.attendee_data : [];
  const created = [];

  for (const group of groups) {
    const orderItems = itemByTt[group.ticket_type_id] || [];
    let groupIndex = 0;
    for (const attendee of group.attendees || []) {
      // Cycle through order items for this ticket type (normally one item).
      const chosen = orderItems.length ? orderItems[groupIndex % orderItems.length] : null;
      if (!chosen) throw new ApiError(500, 'TICKET_CREATION_FAILED');

      let holder;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const code = randomTicketCode();
        const { data, error } = await client
          .from('ticket_holders')
          .insert({
            order_item_id: chosen.id,
            name: attendee.name,
            age: attendee.age,
            gender: attendee.gender || null,
            phone: attendee.phone || null,
            ticket_code: code,
            check_in_status: 'not_checked_in'
          })
          .select('id, ticket_code, name')
          .single();
        if (!error) {
          holder = data;
          break;
        }
        if (error.code === '23505') continue; // code collision — retry
        throw error;
      }
      created.push(holder);
      groupIndex += 1;
    }
  }
  return created;
}

async function getOrder(user, orderId) {
  const client = supabase.getAdminClient();
  const { data, error } = await client
    .from('orders')
    .select(
      'id, user_id, event_id, total_amount, currency, status, created_at, updated_at, attendee_data, ' +
      'events(id, name, slug, venue, address, event_date, start_time, end_time, cover_image), ' +
      'payments(id, provider, amount, currency, status, paid_at, created_at), ' +
      'order_items(id, ticket_type_id, quantity, unit_price, subtotal, ticket_types(id, name, price, admission_count), ticket_holders(id, name, age, gender, phone, ticket_code, check_in_status, checked_in_at))'
    )
    .eq('id', String(orderId))
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError(404, 'ORDER_NOT_FOUND');
  const tickets = [];
  for (const item of data.order_items || []) {
    for (const h of item.ticket_holders || []) {
      tickets.push({
        id: h.id,
        name: h.name,
        ticket_code: h.ticket_code,
        check_in_status: h.check_in_status,
        checked_in_at: h.checked_in_at,
        ticket_type: item.ticket_types ? item.ticket_types.name : null
      });
    }
  }
  return { order: data, tickets };
}

async function listMyOrders(user) {
  const client = supabase.getAdminClient();
  const { data, error } = await client
    .from('orders')
    .select(
      'id, event_id, total_amount, currency, status, created_at, ' +
      'events(id, name, slug, venue, event_date, start_time, end_time, cover_image), ' +
      'payments(id, provider, status, paid_at), ' +
      'order_items(id, ticket_type_id, quantity, ticket_types(id, name), ticket_holders(id, ticket_code, name, check_in_status))'
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return data || [];
}

async function listMyTickets(user) {
  const client = supabase.getAdminClient();
  const { data, error } = await client
    .from('ticket_holders')
    .select(
      'id, name, age, gender, phone, ticket_code, check_in_status, checked_in_at, created_at, ' +
      'order_items!inner(id, order_id, ticket_types(id, name, admission_count), ' +
      'orders!inner(id, user_id, status, event_id, events(id, name, slug, venue, event_date, start_time, end_time, cover_image)))'
    )
    .eq('order_items.orders.user_id', user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

module.exports = {
  listPublishedEvents,
  getEventBySlug,
  createOrder,
  payOrder,
  getOrder,
  listMyOrders,
  listMyTickets
};