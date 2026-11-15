// Shop settings (delivery fee, whether online orders are open). Cached in memory; this app runs as one server.
const crypto = require('node:crypto');
const { query } = require('../db/pool');

const DEFAULTS = { delivery_fee: '0', kitchen_open: '1' };
const cache = new Map();

async function load() {
  const { rows } = await query('SELECT key, value FROM settings');
  rows.forEach(r => cache.set(r.key, r.value));
  if (!cache.has('session_secret')) await set('session_secret', crypto.randomBytes(32).toString('hex'));
}

const get = key => (cache.has(key) ? cache.get(key) : DEFAULTS[key]);

async function set(key, value) {
  await query(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [key, String(value)]);
  cache.set(key, String(value));
}

function getPublic() {
  return { delivery_fee: Number(get('delivery_fee')) || 0, kitchen_open: get('kitchen_open') === '1' };
}

module.exports = { load, get, set, getPublic };
