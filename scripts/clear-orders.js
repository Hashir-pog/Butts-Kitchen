// Deletes every order but keeps the menu and settings. Run before going live if you loaded sample data.
require('../src/config');
const orders = require('../src/models/orders');
const { pool } = require('../src/db/pool');

orders.deleteAll()
  .then(() => console.log('All orders deleted. The menu and settings are unchanged.'))
  .catch(err => { console.error(err.message); process.exitCode = 1; })
  .finally(() => pool.end());
