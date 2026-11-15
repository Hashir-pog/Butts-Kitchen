// The Express application: security headers, API routes, pages, and error handling.
const path = require('node:path');
const express = require('express');
const config = require('./config');
const { router: publicRoutes } = require('./routes/public');
const adminRoutes = require('./routes/admin');
const { UserError } = require('./lib/errors');

const fs = require('node:fs');
// public/ sits next to src/ normally; in the Netlify bundle, look in the working directory too.
const PUBLIC_DIR = [path.join(__dirname, '..', 'public'), path.join(process.cwd(), 'public')]
  .find(dir => fs.existsSync(path.join(dir, 'index.html'))) || path.join(__dirname, '..', 'public');
const app = express();

app.set('trust proxy', 1); // correct visitor IPs and HTTPS detection behind Render/Railway proxies
app.disable('x-powered-by');
app.use(express.json({ limit: '50kb' }));
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY' });
  next();
});

// Health check for the host and uptime monitors
app.get('/health', (req, res) => res.type('text').send('ok'));

app.use('/api', publicRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

// Pages
app.use(express.static(PUBLIC_DIR, { extensions: ['html'], maxAge: '1h' }));
app.get('/track/:code', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'track.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin.html')));
app.use((req, res) => {
  const page = path.join(PUBLIC_DIR, 'index.html');
  if (fs.existsSync(page)) return res.status(404).sendFile(page);
  res.redirect('/');
});

// Errors: friendly messages for expected problems, a generic one for anything else
app.use((err, req, res, next) => {
  if (err instanceof UserError) return res.status(err.status).json({ error: err.message, fields: err.fields });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'That request wasn’t valid.' });
  console.error(err);
  res.status(500).json({ error: `Something went wrong on our side. Try again, or call ${config.phoneDisplay}.` });
});

module.exports = app;
