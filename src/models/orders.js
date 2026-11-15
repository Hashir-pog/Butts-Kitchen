const crypto = require('node:crypto');
const { query, transaction } = require('../db/pool');
const menu = require('./menu');
const settings = require('./settings');
const { UserError } = require('../lib/errors');

const STATUSES = ['new', 'preparing', 'ready', 'completed', 'cancelled'];
const ACTIVE = ['new', 'preparing', 'ready'];
const NEXT_STATUS = { new: 'preparing', preparing: 'ready', ready: 'completed' };

// Times are sent to the browser as milliseconds since 1970 (what JavaScript's Date uses).
const ms = col => `(EXTRACT(EPOCH FROM ${col}) * 1000)::bigint`;

// One query returns orders together with their dishes and status timeline.
const SELECT_ORDERS = `
  SELECT o.id, o.code, o.status, o.type, o.source, o.customer_name, o.phone, o.address, o.notes,
         o.subtotal, o.delivery_fee, o.total, o.cancel_reason,
         ${ms('o.created_at')} AS created_at, ${ms('o.updated_at')} AS updated_at,
         COALESCE((SELECT json_agg(json_build_object('name', i.name, 'variant_label', i.variant_label,
                     'unit_price', i.unit_price, 'qty', i.qty, 'line_total', i.line_total) ORDER BY i.id)
                   FROM order_items i WHERE i.order_id = o.id), '[]') AS items,
         COALESCE((SELECT json_agg(json_build_object('status', e.status, 'at', ${ms('e.created_at')})
                     ORDER BY e.created_at, e.id)
                   FROM order_status_events e WHERE e.order_id = o.id), '[]') AS events
  FROM orders o`;

function trackingCode() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from(crypto.randomBytes(10), b => alphabet[b % alphabet.length]).join('');
}

async function findById(id) {
  const { rows } = await query(`${SELECT_ORDERS} WHERE o.id = $1`, [id]);
  return rows[0] || null;
}

async function findByCode(code) {
  const { rows } = await query(`${SELECT_ORDERS} WHERE o.code = $1`, [code]);
  return rows[0] || null;
}

async function listActive() {
  const { rows } = await query(`${SELECT_ORDERS} WHERE o.status = ANY($1) ORDER BY o.created_at`, [ACTIVE]);
  return rows;
}

/**
 * Create an order. Prices always come from the menu in the database, never from the browser.
 * `lines` is [{ variant_id, qty }]. `at` (ms) is only used by the sample-data script.
 */
async function create({ type, source = 'web', customer_name, phone, address = '', notes = '', lines, at }) {
  const variants = new Map((await menu.findVariants(lines.map(l => l.variant_id))).map(v => [v.id, v]));
  const priced = lines.map(line => {
    const v = variants.get(line.variant_id);
    if (!v) throw new UserError('One of the dishes in your order is no longer on the menu. Remove it and try again.');
    if (!v.available && source === 'web') throw new UserError(`${v.name} is sold out right now. Remove it and try again.`);
    return { ...v, qty: line.qty, line_total: v.price * line.qty };
  });
  const subtotal = priced.reduce((sum, l) => sum + l.line_total, 0);
  const delivery_fee = type === 'delivery' ? settings.getPublic().delivery_fee : 0;
  const createdAt = at ? new Date(at) : new Date();

  const id = await transaction(async client => {
    const { rows: [order] } = await client.query(
      `INSERT INTO orders (code, type, source, customer_name, phone, address, notes,
                           subtotal, delivery_fee, total, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11) RETURNING id`,
      [trackingCode(), type, source, customer_name, phone, address, notes,
       subtotal, delivery_fee, subtotal + delivery_fee, createdAt]);
    for (const l of priced) {
      await client.query(
        `INSERT INTO order_items (order_id, menu_item_id, variant_id, name, variant_label, unit_price, qty, line_total)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [order.id, l.item_id, l.id, l.name, l.label, l.price, l.qty, l.line_total]);
    }
    await client.query('INSERT INTO order_status_events (order_id, status, created_at) VALUES ($1, $2, $3)',
      [order.id, 'new', createdAt]);
    return order.id;
  });
  return findById(id);
}

async function setStatus(id, status, { reason = '', at } = {}) {
  if (!STATUSES.includes(status)) throw new UserError('Unknown status.');
  const when = at ? new Date(at) : new Date();
  const updated = await transaction(async client => {
    const { rowCount } = await client.query(
      'UPDATE orders SET status = $1, cancel_reason = $2, updated_at = $3 WHERE id = $4',
      [status, status === 'cancelled' ? reason : '', when, id]);
    if (!rowCount) return false;
    await client.query('INSERT INTO order_status_events (order_id, status, created_at) VALUES ($1, $2, $3)', [id, status, when]);
    return true;
  });
  return updated ? findById(id) : null;
}

/** Order history with filters. from/to are ms timestamps. */
async function search({ from, to, status, q, limit = 25, offset = 0 }) {
  const where = [];
  const params = [];
  const add = value => { params.push(value); return `$${params.length}`; };
  if (from) where.push(`o.created_at >= to_timestamp(${add(from)} / 1000.0)`);
  if (to) where.push(`o.created_at < to_timestamp(${add(to)} / 1000.0)`);
  if (status && STATUSES.includes(status)) where.push(`o.status = ${add(status)}`);
  if (q) {
    const like = add(`%${q}%`);
    const num = add(q.replace(/^#/, ''));
    where.push(`(o.customer_name ILIKE ${like} OR o.phone LIKE ${like} OR o.id::text = ${num})`);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const countParams = [...params];
  const { rows: [totals] } = await query(
    `SELECT COUNT(*)::int AS total, COALESCE(SUM(total) FILTER (WHERE status <> 'cancelled'), 0)::int AS revenue
     FROM orders o ${clause}`, countParams);
  const { rows } = await query(
    `${SELECT_ORDERS} ${clause} ORDER BY o.created_at DESC LIMIT ${add(limit)} OFFSET ${add(offset)}`, params);
  return { total: totals.total, revenue: totals.revenue, orders: rows };
}

async function deleteAll() {
  await query('TRUNCATE order_status_events, order_items, orders RESTART IDENTITY');
}

module.exports = { STATUSES, ACTIVE, NEXT_STATUS, findById, findByCode, listActive, create, setStatus, search, deleteAll };
