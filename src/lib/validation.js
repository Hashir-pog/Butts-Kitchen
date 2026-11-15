// Checks for anything a customer or the kitchen types in.
const { UserError } = require('./errors');

const PHONE_RE = /^(?:\+92|0092|0)?3\d{9}$/;

/** Pakistani mobile numbers, stored as 03XXXXXXXXX. Returns null if invalid. */
function normalisePhone(raw) {
  const digits = String(raw || '').replace(/[\s\-()]/g, '');
  return PHONE_RE.test(digits) ? '0' + digits.slice(-10) : null;
}

const clean = (value, max) => String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);

/** Validates an order from the checkout form or the phone-order form. Throws UserError with per-field messages. */
function validateOrder(body = {}) {
  const fields = {};
  const customer_name = clean(body.customer_name, 60);
  if (customer_name.length < 2) fields.customer_name = 'Enter the name we should ask for.';

  const phone = normalisePhone(body.phone);
  if (!phone) fields.phone = 'Enter a mobile number like 0345 8081990.';

  const type = ['delivery', 'pickup'].includes(body.type) ? body.type : null;
  if (!type) fields.type = 'Choose pickup or delivery.';

  const address = clean(body.address, 240);
  if (type === 'delivery' && address.length < 8) fields.address = 'Enter a full delivery address, including area and street.';

  const lines = (Array.isArray(body.lines) ? body.lines : [])
    .map(l => ({ variant_id: Number(l.variant_id), qty: Math.floor(Number(l.qty)) }))
    .filter(l => Number.isInteger(l.variant_id) && l.qty > 0);
  if (!lines.length) fields.lines = 'Add at least one dish to your order.';
  else if (lines.length > 30 || lines.some(l => l.qty > 50)) fields.lines = 'That order is too large to place online. Call us on 0345 8081990.';

  if (Object.keys(fields).length) throw new UserError('Check the highlighted fields.', { fields });
  return { customer_name, phone, type, address: type === 'delivery' ? address : '', notes: clean(body.notes, 300), lines };
}

module.exports = { validateOrder, normalisePhone, clean };
