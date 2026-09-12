// lib/payments/MockPaymentProvider.js
//
// DEVELOPMENT-ONLY payment provider.
//
// It simulates the entire lifecycle of a real payment provider without
// moving any money:
//   createPayment()  -> returns provider order + payment ids
//   verifyPayment()  -> claims the payment is captured (or failed)
//   refundPayment()  -> instantly "processes" a refund
//
// The `simulate` flag ('success' | 'failure') is stored in
// provider_metadata so developers can test both purchase outcomes and
// inventory release. See MOCK_PAYMENT_MODE env var.
//
// When Razorpay is wired up later, a RazorpayPaymentProvider will live next
// to this file and implement the SAME interface. Nothing else changes.
'use strict';

const crypto = require('crypto');

class MockPaymentProvider {
  getProviderName() {
    return 'mock';
  }

  // NOTE: this provider is development-only.
  get isDevOnly() {
    return true;
  }

  /**
   * @param {object} opts.payment  the payments row being created
   * @returns provider ids + non-sensitive metadata
   */
  async createPayment({ payment }) {
    const mode = (process.env.MOCK_PAYMENT_MODE || 'both').toLowerCase();
    const simulate = mode === 'both'
      ? (payment.provider_metadata && payment.provider_metadata.simulate === 'failure' ? 'failure' : 'success')
      : mode;

    return {
      provider: 'mock',
      provider_order_id: 'mock_' + payment.order_id,
      provider_payment_id: 'mockpay_' + crypto.randomBytes(8).toString('hex'),
      metadata: { simulate, dev_only: true }
    };
  }

  /**
   * "Verify" a mock payment with the payment provider.
   * @returns {Promise<{verified: boolean, status: string}>}
   */
  async verifyPayment({ payment }) {
    const simulate = payment.provider_metadata && payment.provider_metadata.simulate;
    if (simulate === 'failure') {
      return { verified: false, status: 'failed' };
    }
    return { verified: true, status: 'captured' };
  }

  /**
   * "Process" a refund.
   */
  async refundPayment() {
    return {
      provider_refund_id: 'ref_' + crypto.randomBytes(8).toString('hex'),
      status: 'processed'
    };
  }
}

module.exports = MockPaymentProvider;