// Routes customers use: the menu, placing an order, and tracking it.
const express = require('express');
const config = require('../config');
const menu = require('../models/menu');
const orders = require('../models/orders');
const settings = require('../models/settings');
const live = require('../services/live');
const rateLimit = require('../middleware/rate-limit');
const { validateOrder } = require('../lib/validation');
const { UserError } = require('../lib/errors');

const router = express.Router();

/** What a customer may see about their order (no phone number, address or internal fields). */
function toPublicOrder(o) {
  return {
    number: o.id, code: o.code, status: o.status, type: o.type, customer_name: o.customer_name,
    items: o.items, subtotal: o.subtotal, delivery_fee: o.delivery_fee, total: o.total,
    created_at: o.created_at, events: o.events, cancel_reason: o.cancel_reason,
  };
}

router.get('/menu', async (req, res) => {
  res.json({ menu: await menu.list(), settings: settings.getPublic() });
});

router.post('/orders',
  rateLimit({ limit: 10, windowMs: 10 * 60e3, message: `Too many orders from this device. Call us on ${config.phoneDisplay}.` }),
  async (req, res) => {
    if (!settings.getPublic().kitchen_open) {
      throw new UserError(`The kitchen isn’t taking online orders right now. Call us on ${config.phoneDisplay}.`, { status: 409 });
    }
    const order = await orders.create({ ...validateOrder(req.body), source: 'web' });
    live.publish('order-created', order, toPublicOrder);
    res.status(201).json({ order: toPublicOrder(order) });
  });

router.get('/orders/:code', async (req, res) => {
  const order = await orders.findByCode(req.params.code);
  if (!order) throw new UserError(`We couldn’t find that order. Check the link, or call us on ${config.phoneDisplay}.`, { status: 404 });
  res.json({ order: toPublicOrder(order) });
});

router.get('/orders/:code/stream', async (req, res) => {
  const order = await orders.findByCode(req.params.code);
  if (!order) return res.status(404).end();
  live.open(res);
  live.send(res, 'order', toPublicOrder(order));
  live.addTrackingPage(order.code, req, res);
});

module.exports = { router, toPublicOrder };
