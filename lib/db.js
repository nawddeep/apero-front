// lib/db.js
// ---------------------------------------------------------------------------
// SINGLE DATA-ACCESS MODULE — swap a real database here later.
// All route handlers must use these async functions and never touch storage
// directly. To migrate to MongoDB/PostgreSQL, re-implement these same
// function signatures against the new driver; no route changes needed.
// NOTE: the default backing store below is in-memory and will NOT persist
// across Vercel serverless invocations or restarts. Suitable for local dev
// and API testing only, not production.
// ---------------------------------------------------------------------------
'use strict';

const store = {
  bookings: [], // array of booking objects, newest last
  seq: 1000 // booking_ref counter -> APERO-2026-XXXX
};

function pad4(n) {
  return String(n).padStart(4, '0');
}

function randomSuffix(length) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // exclude O,0,I,1 for clarity
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function nextBookingRef() {
  store.seq += 1;
  let ref = `APERO-2026-${pad4(store.seq)}-${randomSuffix(6)}`;
  // Guard against collision (astronomically unlikely with random suffix)
  while (store.bookings.some((b) => b.booking_ref === ref)) {
    store.seq += 1;
    ref = `APERO-2026-${pad4(store.seq)}-${randomSuffix(6)}`;
  }
  return ref;
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

async function createBooking(data) {
  const booking_ref = nextBookingRef();
  const now = new Date().toISOString();
  const booking = {
    booking_ref,
    tier: data.tier,
    quantity: data.quantity,
    holder_name: data.holder_name,
    email: data.email,
    phone: data.phone,
    mask_selected: data.mask_selected,
    subtotal: data.subtotal,
    tax: data.tax,
    total: data.total,
    purchase_date: now,
    check_in_status: false,
    check_in_time: null,
    payment_status: data.payment_status || 'confirmed',
    rfid_assigned: null
  };
  store.bookings.push(booking);
  return clone(booking);
}

async function getBooking(bookingRef, verifyEmail) {
  const found = store.bookings.find((b) => b.booking_ref === bookingRef);
  if (!found) return null;
  if (verifyEmail && found.email.toLowerCase() !== verifyEmail.toLowerCase()) {
    return null; // email mismatch treated as not found
  }
  return clone(found);
}

async function getSoldQuantity(tier) {
  const sold = store.bookings
    .filter((b) => b.tier === tier)
    .reduce((sum, b) => sum + b.quantity, 0);
  return sold;
}

async function listBookings(filters = {}) {
  let rows = store.bookings.slice();
  if (filters.tier) {
    rows = rows.filter((b) => b.tier === filters.tier);
  }
  if (typeof filters.check_in_status === 'boolean') {
    rows = rows.filter((b) => b.check_in_status === filters.check_in_status);
  }
  if (filters.search) {
    const q = String(filters.search).toLowerCase();
    rows = rows.filter(
      (b) =>
        b.booking_ref.toLowerCase().includes(q) ||
        b.holder_name.toLowerCase().includes(q) ||
        b.email.toLowerCase().includes(q) ||
        b.phone.includes(q)
    );
  }
  rows.sort((a, b) => (a.purchase_date < b.purchase_date ? 1 : -1));
  return clone(rows);
}

async function updateCheckin(bookingRef) {
  const idx = store.bookings.findIndex((b) => b.booking_ref === bookingRef);
  if (idx === -1) return { found: false };
  if (store.bookings[idx].check_in_status) {
    return { found: true, already: true, booking: clone(store.bookings[idx]) };
  }
  store.bookings[idx].check_in_status = true;
  store.bookings[idx].check_in_time = new Date().toISOString();
  if (!store.bookings[idx].rfid_assigned) {
    store.bookings[idx].rfid_assigned =
      'RFID-' + Math.random().toString(36).slice(2, 8).toUpperCase();
  }
  return { found: true, already: false, booking: clone(store.bookings[idx]) };
}

async function getStats() {
  const total_bookings = store.bookings.length;
  let total_guests = 0;
  let total_revenue = 0;
  let checked_in = 0;
  const by_tier = {};
  const peopleByTier = { 'early-bird': 1, stage1: 1, group5: 5, group8: 8 };
  for (const b of store.bookings) {
    const guests = (peopleByTier[b.tier] || 1) * b.quantity;
    total_guests += guests;
    total_revenue += b.total;
    if (b.check_in_status) checked_in += 1;
    by_tier[b.tier] = (by_tier[b.tier] || 0) + 1;
  }
  return {
    total_bookings,
    total_guests,
    total_revenue,
    checked_in,
    pending_checkin: total_bookings - checked_in,
    by_tier
  };
}

// Test-only helper to reset store between runs
async function _reset() {
  store.bookings = [];
  store.seq = 1000;
}

module.exports = {
  createBooking,
  getBooking,
  getSoldQuantity,
  listBookings,
  updateCheckin,
  getStats,
  _reset
};
