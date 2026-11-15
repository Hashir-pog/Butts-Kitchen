const { Pool, types } = require('pg');
const config = require('../config');

// Return BIGINT and NUMERIC values (counts, sums) as JavaScript numbers instead of strings.
types.setTypeParser(types.builtins.INT8, v => Number(v));
types.setTypeParser(types.builtins.NUMERIC, v => Number(v));

const local = /@(localhost|127\.0\.0\.1)[:/]/.test(config.databaseUrl);
const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: local || /sslmode=disable/.test(config.databaseUrl) ? false : { rejectUnauthorized: false },
  max: 10,
});
pool.on('error', err => console.error('Database connection error:', err.message));

const query = (text, params) => pool.query(text, params);

/** Run several queries in one transaction. */
async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, transaction };
