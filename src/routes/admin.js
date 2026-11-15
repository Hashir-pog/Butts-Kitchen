// Routes for the kitchen dashboard. Everything except sign-in needs the PIN session.
const express = require('express');
const menu = require('../models/menu');
const orders = require('../models/orders');
const settings = require('../models/settings');
const stats = require('../models/stats');
const live = require('../services/live');
const auth = require('../middleware/auth');
const rateLimit = require('../middleware/rate-limit');
const { validateOrder, clean } = require('../lib/validation');
const { UserError } = require('../lib/errors');
const { toPublicOrder } = require('./public');

const router = express.Router();

// ---------- Sign-in
router.post('/login',
  rateLimit({ limit: 6, windowMs: 5 * 60e3, message: 'Too many wrong attempts. Wait 5 minutes and try again.' }),
  (req, res) => {
    if (!auth.pinMatches(req.body?.pin)) throw new UserError('That PIN isn’t right. Try again.', { status: 401 });
    auth.startSession(req, res);
    res.json({ ok: true });
  });
router.post('/logout', (req, res) => { auth.endSession(res); res.json({ ok: true }); });
router.get('/session', (req, res) => res.json({ signedIn: auth.isSignedIn(req) }));

router.use(auth.requireAdmin);

// ---------- Live orders
router.get('/stream', async (req, res) => {
  live.open(res);
  live.send(res, 'hello', { active: await orders.listActive() });
  live.addKitchenScreen(req, res);
});

router.get('/orders/active', async (req, res) => res.json({ orders: await orders.listActive() }));

// Orders taken over the phone (sold-out dishes are allowed here)
router.post('/orders', async (req, res) => {
  const order = await orders.create({ ...validateOrder(req.body), source: 'phone' });
  live.publish('order-created', order, toPublicOrder);
  res.status(201).json({ order });
});

router.post('/orders/:id/status', async (req, res) => {
  const current = await orders.findById(Number(req.params.id));
  if (!current) throw new UserError('Order not found.', { status: 404 });
  const status = req.body?.status === 'next' ? orders.NEXT_STATUS[current.status] : req.body?.status;
  if (!orders.STATUSES.includes(status)) throw new UserError('That order can’t move to that step.');
  const order = await orders.setStatus(current.id, status, { reason: clean(req.body?.reason, 160) });
  live.publish('order-updated', order, toPublicOrder);
  res.json({ order });
});

// ---------- History
const filtersFrom = q => ({
  from: Number(q.from) || undefined,
  to: Number(q.to) || undefined,
  status: q.status || undefined,
  q: q.q ? clean(q.q, 60) : undefined,
});

router.get('/orders', async (req, res) => {
  res.json(await orders.search({
    ...filtersFrom(req.query),
    limit: Math.min(Number(req.query.limit) || 25, 100),
    offset: Math.max(Number(req.query.offset) || 0, 0),
  }));
});

router.get('/orders.csv', async (req, res) => {
  const { orders: list } = await orders.search({ ...filtersFrom(req.query), limit: 100000 });
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['Order', 'Date', 'Time', 'Status', 'Type', 'Taken via', 'Customer', 'Phone', 'Address', 'Items', 'Subtotal', 'Delivery fee', 'Total']];
  for (const o of list) {
    const d = new Date(o.created_at);
    rows.push([o.id, d.toLocaleDateString('en-CA'), d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      o.status, o.type, o.source, o.customer_name, o.phone, o.address,
      o.items.map(i => `${i.qty}× ${i.name} (${i.variant_label})`).join('; '), o.subtotal, o.delivery_fee, o.total]);
  }
  res.type('text/csv; charset=utf-8')
    .attachment(`butts-kitchen-orders-${new Date().toLocaleDateString('en-CA')}.csv`)
    .send('﻿' + rows.map(r => r.map(esc).join(',')).join('\r\n'));
});

// ---------- Sales
router.get('/stats', async (req, res) => res.json(await stats.forDashboard(req.query.month)));

// ---------- Menu and settings
router.get('/menu', async (req, res) => {
  res.json({ menu: await menu.list({ includeUnavailable: true }), settings: settings.getPublic() });
});

router.post('/menu/items/:id/availability', async (req, res) => {
  if (!await menu.setAvailable(Number(req.params.id), !!req.body?.available)) throw new UserError('Dish not found.', { status: 404 });
  res.json({ ok: true });
});

router.post('/menu/variants/:id/price', async (req, res) => {
  const price = Math.round(Number(req.body?.price));
  if (!Number.isFinite(price) || price < 1 || price > 1e6) throw new UserError('Enter a price in rupees, like 1199.');
  if (!await menu.setPrice(Number(req.params.id), price)) throw new UserError('Portion not found.', { status: 404 });
  res.json({ ok: true, price });
});

router.post('/settings', async (req, res) => {
  const body = req.body || {};
  if (body.delivery_fee !== undefined) {
    const fee = Math.round(Number(body.delivery_fee));
    if (!Number.isFinite(fee) || fee < 0 || fee > 10000) throw new UserError('Enter a delivery fee between 0 and 10,000.');
    await settings.set('delivery_fee', fee);
  }
  if (body.kitchen_open !== undefined) await settings.set('kitchen_open', body.kitchen_open ? '1' : '0');
  res.json({ settings: settings.getPublic() });
});

module.exports = router;
