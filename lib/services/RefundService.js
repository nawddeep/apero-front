// lib/services/RefundService.js
//
// Provider-agnostic refund processing. The admin UI requests refunds here;
// the service pays through PaymentService (mock today, Razorpay later) and
// keeps the payments/orders/refunds tables consistent for audit.
'use strict';

const supabase = require('../supabase');
const PaymentService = require('../payments/PaymentService');
const { ApiError } = require('../errors');

/**
 * @param {string} adminUserId  verified admin id (from the access token)
 * @param {object} body  { payment_id, amount, reason }
 */
async function createRefund(adminUserId, body) {
  const client = supabase.getAdminClient();
  const paymentId = body && body.payment_id ? String(body.payment_id) : '';
  if (!paymentId) throw new ApiError(400, 'INVALID_PAYLOAD', 'payment_id is required.');

  const amount = Number(body && body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ApiError(422, 'INVALID_REFUND_AMOUNT', 'Refund amount must be a positive number.');
  }
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : '';

  const { data: payment, error: pErr } = await client
    .from('payments')
    .select('id, order_id, provider, amount, currency, status, paid_at')
    .eq('id', paymentId)
    .maybeSingle();
  if (pErr) throw pErr;
  if (!payment) throw new ApiError(404, 'PAYMENT_NOT_FOUND');

  if (!payment.paid_at && payment.status !== 'captured') {
    throw new ApiError(409, 'REFUND_FAILED', 'Only captured payments can be refunded.');
  }

  // Sum previously processed refunds for this payment.
  const { data: prior, error: rErr } = await client
    .from('refunds')
    .select('amount, status')
    .eq('payment_id', paymentId);
  if (rErr) throw rErr;

  const alreadyRefunded = (prior || [])
    .filter((r) => r.status !== 'failed')
    .reduce((sum, r) => sum + Number(r.amount), 0);

  const available = Number(payment.amount) - alreadyRefunded;
  if (amount > available + 0.001) {
    throw new ApiError(409, 'REFUND_EXCEEDS_BALANCE', 'Refund amount exceeds the refundable balance.');
  }

  const provider = PaymentService.getProvider(payment.provider);
  let refundResult;
  try {
    refundResult = await provider.refundPayment({ payment, amount, reason });
  } catch (err) {
    throw new ApiError(502, 'REFUND_FAILED', 'Refund could not be processed by the provider.');
  }

  const { data: refund, error: insErr } = await client
    .from('refunds')
    .insert({
      payment_id: paymentId,
      provider_refund_id: refundResult.provider_refund_id || null,
      amount,
      reason: reason || null,
      status: refundResult.status === 'processed' ? 'processed' : 'pending',
      requested_by: adminUserId,
      processed_at: new Date().toISOString(),
      provider_metadata: refundResult.metadata || { provider: payment.provider }
    })
    .select()
    .single();
  if (insErr) throw insErr;

  const newRefundedTotal = alreadyRefunded + amount;
  const fullyRefunded = newRefundedTotal >= Number(payment.amount) - 0.001;
  const paymentStatus = fullyRefunded ? 'refunded' : 'partially_refunded';
  const orderStatus = fullyRefunded ? 'refunded' : 'partially_refunded';

  await client.from('payments').update({ status: paymentStatus }).eq('id', payment.id);
  await client.from('orders').update({ status: orderStatus }).eq('id', payment.order_id);

  return refund;
}

async function listRefundsForOrder(orderId) {
  const client = supabase.getAdminClient();
  const { data, error } = await client
    .from('refunds')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).filter((r) => r && r.payment_id) || [];
}

module.exports = { createRefund, listRefundsForOrder };