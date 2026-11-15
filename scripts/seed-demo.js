// Fills the database with about 7 weeks of realistic sample orders so the dashboard has something to show.
// Run: npm run db:seed-demo      Remove them again: npm run db:clear-orders
require('../src/config');
const migrate = require('../src/db/migrate');
const settings = require('../src/models/settings');
const menu = require('../src/models/menu');
const orders = require('../src/models/orders');
const { pool } = require('../src/db/pool');

const names = ['Ayesha Khan', 'Bilal Ahmed', 'Sana Malik', 'Usman Tariq', 'Hira Butt', 'Faisal Raza', 'Mahnoor Ali',
  'Hamza Qureshi', 'Zainab Shah', 'Omer Farooq', 'Iqra Javed', 'Saad Hussain', 'Maryam Iqbal', 'Ali Hassan', 'Noor Fatima'];
const addresses = ['House 12, Street 4, G-11/2', 'Flat 3B, Block C, Bahria Town Phase 4', 'House 88, F-10/3',
  'House 5, Lane 2, DHA Phase 2', 'House 21, Street 9, I-8/4', 'House 140, Gulraiz Housing'];
const notes = ['Less spicy please', 'Extra raita', 'Call when outside', 'Please pack naan separately'];
const popularity = { 'Traditional Chicken Karahi': 5, 'Chicken Biryani': 5, 'Special Chicken Boneless Handi': 3, 'Chicken Qorma': 3 };
const busyHours = [12, 13, 13, 14, 15, 17, 18, 19, 19, 20, 20, 20, 21, 21, 22];
const pick = list => list[Math.floor(Math.random() * list.length)];

(async () => {
  await migrate();
  await settings.load();
  const dishes = await menu.list({ includeUnavailable: true });
  const pool_ = dishes.flatMap(d => d.variants.flatMap(v => Array(popularity[d.name] || 2).fill(v.id)));
  const now = new Date();
  let count = 0;

  for (let daysAgo = 48; daysAgo >= 0; daysAgo--) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo);
    const weekend = [5, 6, 0].includes(day.getDay());
    const perDay = Math.round((weekend ? 9 : 5) + Math.random() * 5);
    for (let i = 0; i < perDay; i++) {
      const t = new Date(day);
      t.setHours(pick(busyHours), Math.floor(Math.random() * 60), 0, 0);
      if (t > now - 4 * 60e3) continue;
      const type = Math.random() < 0.62 ? 'delivery' : 'pickup';
      const order = await orders.create({
        type, source: Math.random() < 0.7 ? 'web' : 'phone',
        customer_name: pick(names), phone: '03' + Math.floor(100000000 + Math.random() * 899999999),
        address: type === 'delivery' ? pick(addresses) : '', notes: Math.random() < 0.2 ? pick(notes) : '',
        lines: Array.from({ length: 1 + Math.floor(Math.random() * 2.2) }, () => ({ variant_id: pick(pool_), qty: Math.random() < 0.8 ? 1 : 2 })),
        at: t.getTime(),
      });
      const minutesOld = (now - t) / 60e3;
      const steps = Math.random() < 0.05 ? ['cancelled']
        : minutesOld > 90 ? ['preparing', 'ready', 'completed'] : minutesOld > 45 ? ['preparing', 'ready'] : minutesOld > 15 ? ['preparing'] : [];
      let at = t.getTime();
      for (const status of steps) {
        at = Math.min(at + (8 + Math.random() * 22) * 60e3, now.getTime());
        await orders.setStatus(order.id, status, { at, reason: status === 'cancelled' ? 'Customer asked to cancel' : '' });
      }
      count++;
    }
  }
  console.log(`Added ${count} sample orders.`);
  await pool.end();
})().catch(err => { console.error(err); process.exit(1); });
