// Entry point: prepare the database, then start the web server.
const config = require('./config');
const migrate = require('./db/migrate');
const settings = require('./models/settings');
const app = require('./app');

async function start() {
  await migrate();
  await settings.load();
  app.listen(config.port, () => {
    console.log(`Butts Kitchen running on http://localhost:${config.port}`);
    console.log(`  Customer site:   http://localhost:${config.port}/`);
    console.log(`  Kitchen (owner): http://localhost:${config.port}/admin`);
    if (config.usingDefaultPin) console.warn('  Warning: using the default PIN 1234. Set ADMIN_PIN before going live.');
  });
}

start().catch(err => {
  console.error('Could not start:', err.message);
  process.exit(1);
});
