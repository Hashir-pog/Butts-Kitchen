// Live updates over Server-Sent Events: the kitchen dashboard and each customer's tracking page
// keep a connection open, and we push order changes to them the moment they happen.

const kitchenScreens = new Set();
const trackingPages = new Map(); // order code -> Set of responses

function open(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');
}

function send(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function addKitchenScreen(req, res) {
  kitchenScreens.add(res);
  req.on('close', () => kitchenScreens.delete(res));
}

function addTrackingPage(code, req, res) {
  if (!trackingPages.has(code)) trackingPages.set(code, new Set());
  trackingPages.get(code).add(res);
  req.on('close', () => {
    const set = trackingPages.get(code);
    set.delete(res);
    if (!set.size) trackingPages.delete(code);
  });
}

/** Tell every kitchen screen, and the customer watching this order, what changed. */
function publish(event, order, toPublic) {
  for (const res of kitchenScreens) send(res, event, order);
  for (const res of trackingPages.get(order.code) || []) send(res, 'order', toPublic(order));
}

// A comment line every 25 seconds stops proxies from closing idle connections.
setInterval(() => {
  for (const res of kitchenScreens) res.write(': ping\n\n');
  for (const set of trackingPages.values()) for (const res of set) res.write(': ping\n\n');
}, 25e3).unref();

module.exports = { open, send, addKitchenScreen, addTrackingPage, publish };
