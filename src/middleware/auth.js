// Kitchen sign-in: a PIN, then a signed, HTTP-only session cookie.
const crypto = require('node:crypto');
const config = require('../config');
const settings = require('../models/settings');

const COOKIE = 'bk_session';

const secret = () => (config.sessionSecret || settings.get('session_secret')) + config.adminPin;
const sign = value => crypto.createHmac('sha256', secret()).update(value).digest('base64url');

function readCookie(req) {
  const match = (req.headers.cookie || '').split(';').map(c => c.trim()).find(c => c.startsWith(COOKIE + '='));
  return match ? decodeURIComponent(match.slice(COOKIE.length + 1)) : null;
}

function isSignedIn(req) {
  const token = readCookie(req);
  if (!token) return false;
  const [exp, sig] = token.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const expected = sign(exp);
  return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

function pinMatches(pin) {
  const given = Buffer.from(String(pin || ''));
  const real = Buffer.from(config.adminPin);
  return given.length === real.length && crypto.timingSafeEqual(given, real);
}

function startSession(req, res) {
  const maxAge = config.sessionDays * 86400;
  const exp = String(Date.now() + maxAge * 1000);
  res.cookie(COOKIE, `${exp}.${sign(exp)}`, { httpOnly: true, sameSite: 'strict', secure: req.secure, maxAge: maxAge * 1000, path: '/' });
}

function endSession(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

function requireAdmin(req, res, next) {
  if (isSignedIn(req)) return next();
  res.status(401).json({ error: 'Enter the kitchen PIN to continue.' });
}

module.exports = { isSignedIn, pinMatches, startSession, endSession, requireAdmin };
