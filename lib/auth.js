// lib/auth.js
// Customer + admin authentication middleware.
//
// Access tokens are Supabase session JWTs (sent as `Authorization: Bearer`).
// The backend resolves them through Supabase Auth (getUser) and enforces
// ownership + admin membership server-side. RLS continues to enforce
// authorization at the database layer as well.
'use strict';

const supabase = require('./supabase');

function extractBearer(req) {
  const header = req.headers.authorization || '';
  const parts = header.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1]) return '';
  return parts[1].trim();
}

async function requireUser(req, res, next) {
  try {
    const token = extractBearer(req);
    if (!token) {
      return res.status(401).json({ success: false, error: 'UNAUTHORIZED', message: 'Missing access token.' });
    }
    const user = await supabase.getUserFromToken(token);
    if (!user) {
      return res.status(401).json({ success: false, error: 'UNAUTHORIZED', message: 'Invalid or expired session.' });
    }
    req.user = user;
    return next();
  } catch (err) {
    console.error('requireUser failed:', err);
    return res.status(500).json({ success: false, error: 'INTERNAL_SERVER_ERROR' });
  }
}

async function requireAdmin(req, res, next) {
  try {
    const token = extractBearer(req);
    if (!token) {
      return res.status(401).json({ success: false, error: 'UNAUTHORIZED', message: 'Missing access token.' });
    }
    const user = await supabase.getUserFromToken(token);
    if (!user) {
      return res.status(401).json({ success: false, error: 'UNAUTHORIZED', message: 'Invalid or expired session.' });
    }
    const admin = await supabase.isAdminUser(user.id);
    if (!admin) {
      return res.status(403).json({ success: false, error: 'UNAUTHORIZED', message: 'Admin access required.' });
    }
    req.user = user;
    return next();
  } catch (err) {
    console.error('requireAdmin failed:', err);
    return res.status(500).json({ success: false, error: 'INTERNAL_SERVER_ERROR' });
  }
}

module.exports = { requireUser, requireAdmin, extractBearer };