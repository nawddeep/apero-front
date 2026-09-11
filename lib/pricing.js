// lib/pricing.js
// Single source of truth for ticket pricing. Server computes all totals —
// client-supplied subtotal/tax/total are ignored to prevent tampering.
'use strict';

const GST_RATE = 0.18;

const TIERS = {
  'early-bird': { tier: 'early-bird', label: 'EARLY BIRD', price: 1333, perPerson: 1333, people: 1, sellable: true, maxCapacity: 50 },
  'stage1': { tier: 'stage1', label: 'STAGE 1', price: 1777, perPerson: 1777, people: 1, sellable: true, maxCapacity: 100 },
  'group5': { tier: 'group5', label: 'GROUP OF 5', price: 6000, perPerson: 1200, people: 5, sellable: true, maxCapacity: 40 },
  'group8': { tier: 'group8', label: 'GROUP OF 8', price: 9200, perPerson: 1150, people: 8, sellable: true, maxCapacity: 30 },
  // Not sellable but recognised so we can return clear errors:
  'super-early': { tier: 'super-early', label: 'SUPER EARLY BIRD', price: 1111, perPerson: 1111, people: 1, sellable: false, reason: 'SOLD OUT', maxCapacity: 0 },
  'stage2': { tier: 'stage2', label: 'STAGE 2', price: 0, perPerson: 0, people: 1, sellable: false, reason: 'COMING SOON', maxCapacity: 0 }
};

const MASKS = ['obsidian-veil', 'crimson-phantom', 'noir-kinetic', 'cipher-visage'];

function getTier(tier) {
  if (typeof tier !== 'string') return null;
  const key = tier.trim().toLowerCase();
  return TIERS[key] || null;
}

function computeTotals(tierKey, quantity) {
  const t = getTier(tierKey);
  if (!t) throw new Error('Unknown tier');
  const subtotal = t.price * quantity;
  const tax = Math.round(subtotal * GST_RATE);
  const total = subtotal + tax;
  return { subtotal, tax, total };
}

module.exports = { GST_RATE, TIERS, MASKS, getTier, computeTotals };
