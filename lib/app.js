// lib/app.js
// Express application exposing the shared Backend Services for both the
// customer site (a.com) and the admin dashboard (b.com).
//
//   Public:
//     GET  /api/health
//     GET  /api/events            published events + availability
//     GET  /api/events/:slug      event details + active ticket types
//
//   Customer (authenticated with a Supabase access token):
//     POST /api/orders             create pending order + payment intent
//     POST /api/orders/:id/pay     verify mock payment, create tickets / release
//     GET  /api/orders/:id         order detail (owner only)
//     GET  /api/my/orders          my orders
//     GET  /api/my/tickets         my ticket holders
//
//   Admin (authenticated + must be in admin_users):
//     POST /api/admin/refunds      request a refund via PaymentService
//     GET  /api/admin/export       CSV export of orders
'use strict';

const express = require('express');
const cors = require('cors');
const { ApiError, sendError } = require('./errors');
const { requireUser, requireAdmin } = require('./auth');
const OrderService = require('./services/OrderService');
const RefundService = require('./services/RefundService');

function asyncHandler(fn) {
  return (req, res) => {
    Promise.resolve(fn(req, res)).catch((err) => sendError(res, err));
  };
}

function createApp() {
  const app = express();
  app.disable('x-powered-by');

  const envOrigins = String(process.env.FRONTEND_URL || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const corsOrigins = [
    'https://aperonight.fun',
    'https://www.aperonight.fun',
    'http://localhost:3000',
    'http://localhost:5000',
    'http://127.0.0.1:5500',
    'http://localhost:5500'
  ];
  for (const o of envOrigins) if (!corsOrigins.includes(o)) corsOrigins.push(o);

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
  app.use(express.json({ limit: '256kb' }));

  app.get('/api/health', (req, res) => {
    res.json({ success: true, service: 'apero-backend-services', time: new Date().toISOString() });
  });

  // ---- Public: event discovery --------------------------------------
  app.get('/api/events', asyncHandler(async (req, res) => {
    const events = await OrderService.listPublishedEvents();
    res.json({ success: true, events });
  }));

  app.get('/api/events/:slug', asyncHandler(async (req, res) => {
    const slug = String(req.params.slug || '').trim().toLowerCase().slice(0, 120);
    if (!slug) throw new ApiError(400, 'EVENT_NOT_FOUND');
    const event = await OrderService.getEventBySlug(slug);
    res.json({ success: true, event });
  }));

  // ---- Customer: order flow ------------------------------------------
  app.post('/api/orders', requireUser, asyncHandler(async (req, res) => {
    const result = await OrderService.createOrder(req.user, req.body || {});
    res.status(201).json({ success: true, ...result });
  }));

  app.get('/api/orders/:id', requireUser, asyncHandler(async (req, res) => {
    const result = await OrderService.getOrder(req.user, req.params.id);
    res.json({ success: true, ...result });
  }));

  app.post('/api/orders/:id/pay', requireUser, asyncHandler(async (req, res) => {
    const simulate = req.body && req.body.simulate === 'failure' ? 'failure' : 'success';
    const result = await OrderService.payOrder(req.user, req.params.id, { simulate });
    res.json({ success: result.success === false ? false : true, ...result });
  }));

  app.get('/api/my/orders', requireUser, asyncHandler(async (req, res) => {
    const orders = await OrderService.listMyOrders(req.user);
    res.json({ success: true, orders });
  }));

  app.get('/api/my/tickets', requireUser, asyncHandler(async (req, res) => {
    const tickets = await OrderService.listMyTickets(req.user);
    res.json({ success: true, tickets });
  }));

  // ---- Admin ----------------------------------------------------------
  app.post('/api/admin/refunds', requireAdmin, asyncHandler(async (req, res) => {
    const refund = await RefundService.createRefund(req.user.id, req.body || {});
    res.status(201).json({ success: true, refund });
  }));

  app.get('/api/admin/export', requireAdmin, asyncHandler(async (req, res) => {
    const csv = await exportCsv();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="apero-orders.csv"');
    res.status(200).send(csv);
  }));

  // 404 for unknown /api routes
  app.use('/api', (req, res) => {
    res.status(404).json({ success: false, error: 'API route not found' });
  });

  // Generic error handler (never leak internals)
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    sendError(res, err);
  });

  return app;
}

async function exportCsv() {
  const supabase = require('./supabase').getAdminClient();
  const { data: orders, error } = await supabase
    .from('orders')
    .select(
      'id, user_id, event_id, total_amount, currency, status, created_at, ' +
      'events(name, slug), order_items(quantity, unit_price, ticket_types(name))'
    )
    .order('created_at', { ascending: false });
  if (error) throw error;

  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };

  const header = ['order_id', 'event', 'status', 'total', 'currency', 'ticket_type', 'quantity', 'created_at'].join(',');
  const lines = [header];
  for (const o of orders || []) {
    const items = o.order_items && o.order_items.length ? o.order_items : [{ quantity: '', unit_price: '', ticket_types: null }];
    for (const item of items) {
      lines.push(
        [
          o.id,
          o.events && o.events.name,
          o.status,
          o.total_amount,
          o.currency,
          item.ticket_types && item.ticket_types.name,
          item.quantity,
          o.created_at
        ].map(esc).join(',')
      );
    }
  }
  return lines.join('\n');
}

module.exports = { createApp };