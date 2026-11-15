const { query } = require('../db/pool');

async function list({ includeUnavailable = false } = {}) {
  const { rows } = await query(`
    SELECT i.id, i.slug, i.category, i.name, i.description, i.is_new, i.available,
           COALESCE(json_agg(json_build_object('id', v.id, 'label', v.label, 'note', v.note, 'price', v.price)
                    ORDER BY v.sort_order, v.id) FILTER (WHERE v.id IS NOT NULL), '[]') AS variants
    FROM menu_items i
    LEFT JOIN menu_variants v ON v.item_id = i.id
    ${includeUnavailable ? '' : 'WHERE i.available'}
    GROUP BY i.id
    ORDER BY i.sort_order, i.id`);
  return rows;
}

/** Variants with their dish, used to price an order. */
async function findVariants(ids) {
  const { rows } = await query(`
    SELECT v.id, v.label, v.price, i.id AS item_id, i.name, i.available
    FROM menu_variants v JOIN menu_items i ON i.id = v.item_id
    WHERE v.id = ANY($1::int[])`, [ids]);
  return rows;
}

async function setAvailable(itemId, available) {
  const { rowCount } = await query('UPDATE menu_items SET available = $1 WHERE id = $2', [available, itemId]);
  return rowCount > 0;
}

async function setPrice(variantId, price) {
  const { rowCount } = await query('UPDATE menu_variants SET price = $1 WHERE id = $2', [price, variantId]);
  return rowCount > 0;
}

module.exports = { list, findVariants, setAvailable, setPrice };
