// lib/errors.js
// Shared application errors with a stable, user-safe `code`.
// Never leak internal database details to customers.
'use strict';

class ApiError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

function sendError(res, err) {
  if (err && err.name === 'ApiError') {
    return res.status(err.status).json({ success: false, error: err.code, message: err.message });
  }
  console.error('Unhandled error:', err);
  return res.status(500).json({ success: false, error: 'INTERNAL_SERVER_ERROR' });
}

module.exports = { ApiError, sendError };