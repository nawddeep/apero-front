// lib/validation.js
// Input validation + light sanitisation for all booking/admin inputs.
'use strict';

const { getTier, MASKS } = require('./pricing');

function sanitizeStr(v, maxLen) {
  if (typeof v !== 'string') return '';
  let s = v.trim().replace(/\s+/g, ' ');
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}

function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  const e = email.trim();
  if (e.length < 5 || e.length > 120) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
}

function isValidPhone(phone) {
  if (typeof phone !== 'string' && typeof phone !== 'number') return false;
  const digits = String(phone).replace(/\D/g, '');
  const normalized = digits.replace(/^91(?=\d{10}$)/, '');
  return normalized.length >= 8 && normalized.length <= 12 && digits.length >= 8 && digits.length <= 15;
}

function validateBookingInput(body) {
  const errors = [];
  const b = body || {};

  const tierRaw = typeof b.tier === 'string' ? b.tier.trim().toLowerCase() : '';
  const tierInfo = getTier(tierRaw);
  if (!tierRaw) {
    errors.push('tier is required (early-bird | stage1 | group5 | group8)');
  } else if (!tierInfo) {
    errors.push(`Unknown tier "${tierRaw}". Allowed: early-bird, stage1, group5, group8`);
  } else if (!tierInfo.sellable) {
    errors.push(`Tier "${tierInfo.label}" is not purchasable (${tierInfo.reason}).`);
  }

  const quantity = Number(b.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
    errors.push('quantity must be an integer between 1 and 10');
  }

  const holder_name = sanitizeStr(b.holder_name, 80);
  if (holder_name.length < 2) errors.push('holder_name must be at least 2 characters');

  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase().slice(0, 120) : '';
  if (!isValidEmail(email)) errors.push('email must be a valid email address');

  const phone = typeof b.phone === 'string' ? b.phone.trim().slice(0, 20) : String(b.phone || '').slice(0, 20);
  if (!isValidPhone(phone)) errors.push('phone must be a valid phone number (8-15 digits)');

  const mask_selected = typeof b.mask_selected === 'string' ? b.mask_selected.trim().toLowerCase().slice(0, 40) : '';
  if (!mask_selected) {
    errors.push('mask_selected is required (obsidian-veil | crimson-phantom | noir-kinetic | cipher-visage)');
  } else if (!MASKS.includes(mask_selected)) {
    errors.push(`Unknown mask "${mask_selected}". Allowed: ${MASKS.join(', ')}`);
  }

  const value = {
    tier: tierRaw,
    quantity,
    holder_name,
    email,
    phone: String(phone).replace(/[^\d+]/g, '').slice(0, 16),
    mask_selected
  };
  return { valid: errors.length === 0, errors, value };
}

function validateLoginInput(body) {
  const errors = [];
  const b = body || {};
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  const password = typeof b.password === 'string' ? b.password : '';
  if (!isValidEmail(email)) errors.push('email must be a valid email address');
  if (!password || password.length < 1) errors.push('password is required');
  return { valid: errors.length === 0, errors, value: { email, password } };
}

function validateCheckinInput(body) {
  const errors = [];
  const b = body || {};
  const ref = typeof b.booking_ref === 'string' ? b.booking_ref.trim().toUpperCase().slice(0, 40) : '';
  if (!ref) {
    errors.push('booking_ref is required (e.g. APERO-2026-1001-A7K9XQ)');
  } else if (!/^APERO-2026-\d{4,}-[A-Z2-9]{6}$/.test(ref)) {
    errors.push('booking_ref format must be APERO-2026-XXXX-YYYYYY');
  }
  return { valid: errors.length === 0, errors, value: { booking_ref: ref } };
}

function validateBookingLookup(id, email) {
  const errors = [];
  const refRaw = typeof id === 'string' ? id.trim().toUpperCase().slice(0, 40) : '';
  if (!refRaw) {
    errors.push('booking_ref is required');
  } else if (!/^APERO-2026-\d{4,}-[A-Z2-9]{6}$/.test(refRaw)) {
    errors.push('Invalid booking_ref format. Expected: APERO-2026-XXXX-YYYYYY');
  }
  const emailNorm = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!isValidEmail(emailNorm)) {
    errors.push('email query parameter is required and must be a valid email');
  }
  return { valid: errors.length === 0, errors, value: { booking_ref: refRaw, email: emailNorm } };
}

module.exports = { sanitizeStr, isValidEmail, isValidPhone, validateBookingInput, validateLoginInput, validateCheckinInput, validateBookingLookup };
