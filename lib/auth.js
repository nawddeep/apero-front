// lib/auth.js
// JWT helpers + Express middleware for admin routes. Secrets come from env.
'use strict';

const jwt = require('jsonwebtoken');

function getSecret() {
  return process.env.JWT_SECRET || '';
}

function signAdminToken(payload) {
  const secret = getSecret();
  if (!secret) throw new Error('JWT_SECRET is not configured');
  const expiresIn = process.env.JWT_EXPIRES_IN || '12h';
  return jwt.sign(payload, secret, { expiresIn });
}

function verifyAdminToken(token) {
  const secret = getSecret();
  if (!secret) throw new Error('JWT_SECRET is not configured');
  return jwt.verify(token, secret);
}

function requireAdminAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const parts = header.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1]) {
      return res.status(401).json({ success: false, error: 'Missing or malformed Authorization header. Use: Bearer <token>' });
    }
    const decoded = verifyAdminToken(parts[1]);
    if (!decoded || decoded.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Forbidden: admin role required' });
    }
    req.admin = decoded;
    return next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}

module.exports = { signAdminToken, verifyAdminToken, requireAdminAuth };
