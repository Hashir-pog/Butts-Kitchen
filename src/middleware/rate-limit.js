/** Small in-memory rate limiter: at most `limit` requests per `windowMs` per visitor IP. */
module.exports = function rateLimit({ limit, windowMs, message }) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const recent = (hits.get(req.ip) || []).filter(t => now - t < windowMs);
    recent.push(now);
    hits.set(req.ip, recent);
    if (hits.size > 5000) hits.clear();
    if (recent.length > limit) return res.status(429).json({ error: message });
    next();
  };
};
