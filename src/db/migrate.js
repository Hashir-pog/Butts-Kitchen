// Creates the tables (if missing) and adds the starting menu (if empty).
// Runs automatically when the server starts; can also be run with `npm run db:migrate`.
const fs = require('node:fs');
const path = require('node:path');
const { query, transaction } = require('./pool');
const MENU = require('./menu-seed');

async function migrate() {
  // The Netlify build embeds schema.sql as BK_SCHEMA_SQL (see scripts/build-server.mjs).
  const sql = process.env.BK_SCHEMA_SQL || fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await query(sql);
  const { rows } = await query('SELECT COUNT(*)::int AS n FROM menu_items');
  if (rows[0].n > 0) return;
  await transaction(async client => {
    for (const [i, item] of MENU.entries()) {
      const { rows: [created] } = await client.query(
        `INSERT INTO menu_items (slug, category, name, description, is_new, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [item.slug, item.category, item.name, item.description, item.isNew, i]);
      for (const [j, v] of item.variants.entries()) {
        await client.query(
          'INSERT INTO menu_variants (item_id, label, note, price, sort_order) VALUES ($1, $2, $3, $4, $5)',
          [created.id, v.label, v.note || '', v.price, j]);
      }
    }
  });
  console.log('Added the starting menu.');
}

module.exports = migrate;

if (require.main === module) {
  migrate().then(() => { console.log('Database is up to date.'); process.exit(0); })
    .catch(err => { console.error(err); process.exit(1); });
}
