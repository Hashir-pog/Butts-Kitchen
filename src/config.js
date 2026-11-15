// All configuration comes from environment variables (see .env.example).
process.env.TZ = process.env.TZ || 'Asia/Karachi';

const config = {
  port: Number(process.env.PORT) || 3000,
  databaseUrl: process.env.DATABASE_URL,
  adminPin: String(process.env.ADMIN_PIN || '1234').trim(), // trim: pasted values often carry a stray space or newline
  usingDefaultPin: !process.env.ADMIN_PIN,
  sessionSecret: process.env.SESSION_SECRET || '',
  sessionDays: 14,
  timeZone: process.env.TZ,
  phoneDisplay: '0345 8081990',
};

if (!config.databaseUrl) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env and add your PostgreSQL connection string.');
  process.exit(1);
}

module.exports = config;
