// lib/app.js
// Express application: public booking API + JWT-protected admin API.
// Mounted by server.js (local) and api/index.js (Vercel serverless).
'use strict';

const express = require('express');
const cors = require('cors');
const db = require('./db');
const { getTier, computeTotals } = require('./pricing');
const { validateBookingInput, validateLoginInput, validateCheckinInput, validateBookingLookup } = require('./validation');
const { signAdminToken, requireAdminAuth } = require('./auth');

// ---- IN-MEMORY RATE LIMITER (for /api/admin/login) ----
const loginAttempts = new Map(); // key: IP, value: { count, resetAt }

function getRateLimitConfig() {
  return {
    maxAttempts: Number(process.env.RATE_LIMIT_MAX) || 5,
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000 // 15 min default
  };
}

function rateLimitLogin(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const config = getRateLimitConfig();
  
  if (!loginAttempts.has(ip)) {
    loginAttempts.set(ip, { count: 1, resetAt: now + config.windowMs });
    return next();
  }
  
  const record = loginAttempts.get(ip);
  if (now > record.resetAt) {
    // window expired, reset
    loginAttempts.set(ip, { count: 1, resetAt: now + config.windowMs });
    return next();
  }
  
  if (record.count >= config.maxAttempts) {
    const retryAfterSec = Math.ceil((record.resetAt - now) / 1000);
    return res.status(429).json({
      success: false,
      error: `Too many login attempts. Please retry after ${retryAfterSec} seconds.`,
      retryAfter: retryAfterSec
    });
  }
  
  record.count += 1;
  return next();
}

// Periodic cleanup to prevent memory leak (runs every hour)
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of loginAttempts.entries()) {
    if (now > record.resetAt + 3600000) { // 1 hour past reset
      loginAttempts.delete(ip);
    }
  }
}, 3600000);

function createApp() {
  const app = express();
  app.disable('x-powered-by');

  const frontendUrl = (process.env.FRONTEND_URL || '').trim();
  const corsOrigins = ['https://aperonight.fun', 'https://www.aperonight.fun', 'http://localhost:3000', 'http://localhost:5000'];
  if (frontendUrl && !corsOrigins.includes(frontendUrl)) corsOrigins.push(frontendUrl);

  app.use(
    cors({
      origin(origin, cb) {
        if (!origin) return cb(null, true);
        if (corsOrigins.includes(origin)) return cb(null, true);
        return cb(null, false);
      },
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 86400
    })
  );
  app.use(express.json({ limit: '32kb' }));

  app.get('/api/health', (req, res) => {
    res.json({ success: true, service: 'apero-booking-api', time: new Date().toISOString() });
  });

  // ---- POST /api/bookings -> create a booking ----
  app.post('/api/bookings', async (req, res) => {
    try {
      const { valid, errors, value } = validateBookingInput(req.body);
      if (!valid) {
        return res.status(400).json({ success: false, error: 'Validation failed', details: errors });
      }
      const tierInfo = getTier(value.tier);
      
      // Check capacity before booking
      const soldQty = await db.getSoldQuantity(value.tier);
      const requestedQty = value.quantity;
      const maxCap = tierInfo.maxCapacity;
      
      if (soldQty + requestedQty > maxCap) {
        return res.status(409).json({
          success: false,
          error: `Insufficient capacity for ${tierInfo.label}. Only ${maxCap - soldQty} tickets remaining.`,
          available: maxCap - soldQty,
          requested: requestedQty
        });
      }
      
      const { subtotal, tax, total } = computeTotals(value.tier, value.quantity);
      const booking = await db.createBooking({
        tier: value.tier,
        quantity: value.quantity,
        holder_name: value.holder_name,
        email: value.email,
        phone: value.phone,
        mask_selected: value.mask_selected,
        subtotal,
        tax,
        total,
        payment_status: 'confirmed'
      });
      return res.status(201).json({
        success: true,
        booking,
        ticket: {
          ticketId: tierInfo.tier,
          ticketName: tierInfo.label,
          price: tierInfo.price,
          perPerson: tierInfo.perPerson,
          quantity: value.quantity
        }
      });
    } catch (err) {
      console.error('POST /api/bookings failed:', err);
      return res.status(500).json({ success: false, error: 'Unable to create booking. Please retry.' });
    }
  });

  // ---- GET /api/bookings/:id -> get one booking by booking_ref (requires email verification) ----
  app.get('/api/bookings/:id', async (req, res) => {
    try {
      const id = String(req.params.id || '').trim().toUpperCase().slice(0, 40);
      const email = String(req.query.email || '').trim();
      
      const { valid, errors, value } = validateBookingLookup(id, email);
      if (!valid) {
        return res.status(400).json({ success: false, error: 'Validation failed', details: errors });
      }
      
      const booking = await db.getBooking(value.booking_ref, value.email);
      if (!booking) {
        return res.status(404).json({ success: false, error: 'Booking not found or email does not match' });
      }
      return res.json({ success: true, booking });
    } catch (err) {
      console.error('GET /api/bookings/:id failed:', err);
      return res.status(500).json({ success: false, error: 'Unable to fetch booking. Please retry.' });
    }
  });

  // ---- POST /api/admin/login -> returns JWT (rate limited) ----
  app.post('/api/admin/login', rateLimitLogin, async (req, res) => {
    try {
      const { valid, errors, value } = validateLoginInput(req.body);
      if (!valid) {
        return res.status(400).json({ success: false, error: 'Validation failed', details: errors });
      }
      const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
      const adminPassword = process.env.ADMIN_PASSWORD || '';
      if (!adminEmail || !adminPassword) {
        return res.status(500).json({ success: false, error: 'Admin auth is not configured on the server' });
      }
      if (value.email !== adminEmail || value.password !== adminPassword) {
        return res.status(401).json({ success: false, error: 'Invalid email or password' });
      }
      const token = signAdminToken({ role: 'admin', email: adminEmail });
      return res.json({ success: true, token });
    } catch (err) {
      console.error('POST /api/admin/login failed:', err);
      return res.status(500).json({ success: false, error: 'Login failed. Please retry.' });
    }
  });

  // ---- GET /api/admin/bookings (JWT) ----
  app.get('/api/admin/bookings', requireAdminAuth, async (req, res) => {
    try {
      const { search, tier, check_in_status } = req.query;
      const filters = {};
      if (typeof search === 'string' && search.trim()) filters.search = search.trim().slice(0, 80);
      if (typeof tier === 'string' && tier.trim()) {
        const t = tier.trim().toLowerCase();
        if (!['early-bird', 'stage1', 'group5', 'group8'].includes(t)) {
          return res.status(400).json({ success: false, error: 'Invalid tier filter' });
        }
        filters.tier = t;
      }
      if (typeof check_in_status === 'string' && check_in_status.trim() !== '') {
        const v = check_in_status.trim().toLowerCase();
        if (v === 'true' || v === 'checked_in' || v === '1') filters.check_in_status = true;
        else if (v === 'false' || v === 'pending' || v === '0') filters.check_in_status = false;
        else return res.status(400).json({ success: false, error: 'Invalid check_in_status filter (use true/false)' });
      }
      const bookings = await db.listBookings(filters);
      return res.json({ success: true, count: bookings.length, bookings });
    } catch (err) {
      console.error('GET /api/admin/bookings failed:', err);
      return res.status(500).json({ success: false, error: 'Unable to list bookings. Please retry.' });
    }
  });

  // ---- POST /api/admin/checkin (JWT) ----
  app.post('/api/admin/checkin', requireAdminAuth, async (req, res) => {
    try {
      const { valid, errors, value } = validateCheckinInput(req.body);
      if (!valid) {
        return res.status(400).json({ success: false, error: 'Validation failed', details: errors });
      }
      const result = await db.updateCheckin(value.booking_ref);
      if (!result.found) {
        return res.status(404).json({ success: false, error: 'Booking not found' });
      }
      if (result.already) {
        return res.status(200).json({ success: true, already_checked_in: true, booking: result.booking });
      }
      return res.json({ success: true, already_checked_in: false, booking: result.booking });
    } catch (err) {
      console.error('POST /api/admin/checkin failed:', err);
      return res.status(500).json({ success: false, error: 'Check-in failed. Please retry.' });
    }
  });

  // ---- GET /api/admin/stats (JWT) ----
  app.get('/api/admin/stats', requireAdminAuth, async (req, res) => {
    try {
      const stats = await db.getStats();
      return res.json({ success: true, stats });
    } catch (err) {
      console.error('GET /api/admin/stats failed:', err);
      return res.status(500).json({ success: false, error: 'Unable to load stats. Please retry.' });
    }
  });

  // ---- GET /api/admin/export (JWT) -> CSV ----
  app.get('/api/admin/export', requireAdminAuth, async (req, res) => {
    try {
      const bookings = await db.listBookings();
      const header = [
        'booking_ref', 'tier', 'quantity', 'holder_name', 'email', 'phone',
        'mask_selected', 'subtotal', 'tax', 'total', 'purchase_date',
        'check_in_status', 'check_in_time', 'payment_status', 'rfid_assigned'
      ];
      const esc = (v) => {
        if (v === null || v === undefined) return '';
        const s = String(v);
        if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
        return s;
      };
      const lines = [header.join(',')];
      for (const b of bookings) {
        lines.push(
          [
            b.booking_ref, b.tier, b.quantity, b.holder_name, b.email, b.phone,
            b.mask_selected, b.subtotal, b.tax, b.total, b.purchase_date,
            b.check_in_status ? 'checked_in' : 'pending',
            b.check_in_time || '', b.payment_status || '', b.rfid_assigned || ''
          ]
            .map(esc)
            .join(',')
        );
      }
      const csv = lines.join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="apero-bookings.csv"');
      return res.status(200).send(csv);
    } catch (err) {
      console.error('GET /api/admin/export failed:', err);
      return res.status(500).json({ success: false, error: 'Export failed. Please retry.' });
    }
  });

  // 404 for unknown /api routes
  app.use('/api', (req, res) => {
    res.status(404).json({ success: false, error: 'API route not found' });
  });

  // Generic error handler (never leak internals)
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('Unhandled app error:', err);
    if (res.headersSent) return next(err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };
