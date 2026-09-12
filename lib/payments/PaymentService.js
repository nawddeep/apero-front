// lib/payments/PaymentService.js
//
// Provider-agnostic payment gateway. The rest of the application ONLY talks
// to PaymentService — never to a specific provider.
//
//   PaymentService
//     ├── MockPaymentProvider        (development)
//     └── RazorpayPaymentProvider    (added later — same interface)
//
// To add a new provider later:
//   1. implement the same method surface in a new file,
//   2. call registerProvider(new RazorpayPaymentProvider()).
// No other application code changes.
'use strict';

const MockPaymentProvider = require('./MockPaymentProvider');

const registry = {};

function registerProvider(provider) {
  if (!provider || typeof provider.getProviderName !== 'function') {
    throw new Error('Invalid payment provider');
  }
  registry[provider.getProviderName()] = provider;
}

function getProvider(name) {
  const key = name || 'mock';
  const provider = registry[key];
  if (!provider) throw new Error('UNKNOWN_PAYMENT_PROVIDER:' + key);
  return provider;
}

registerProvider(new MockPaymentProvider());

module.exports = {
  registerProvider,
  getProvider,
  getAvailableProviders: () => Object.keys(registry)
};