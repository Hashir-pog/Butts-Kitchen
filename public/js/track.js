// Live order tracking for customers
(() => {
  const { $, esc, money, api, time, statusLabel, ICONS } = BK;
  BK.initTheme($('#themeBtn'));
  $('.call-icon').innerHTML = ICONS.phone;

  const code = decodeURIComponent(location.pathname.split('/').pop());
  const isNew = new URLSearchParams(location.search).has('new');
  if (isNew) history.replaceState(null, '', location.pathname);
  let order = null;
  let live = false;

  const POT = `<svg class="pot" viewBox="0 0 64 64" aria-hidden="true"><g class="steam" fill="none" stroke="var(--chili)" stroke-width="2.5" stroke-linecap="round"><path d="M24 6c-3 3 3 5 0 9"/><path d="M32 4c-3 3 3 5 0 10"/><path d="M40 6c-3 3 3 5 0 9"/></g><path d="M10 26h44v6a20 20 0 0 1-20 20h-4a20 20 0 0 1-20-20z" fill="var(--leaf)"/><rect x="6" y="22" width="52" height="6" rx="3" fill="var(--leaf-strong)"/><path d="M4 32h6M54 32h6" stroke="var(--leaf-strong)" stroke-width="4" stroke-linecap="round"/><path d="M18 58h28" stroke="var(--line-strong)" stroke-width="3" stroke-linecap="round"/></svg>`;

  const MESSAGES = {
    new: o => ['We’ve got your order', 'The kitchen will start on it in a moment.'],
    preparing: o => ['Your food is cooking', 'Fresh on the stove now. We’ll update this page when it’s ready.'],
    ready: o => o.type === 'delivery' ? ['On the way to you', 'Your order has left the kitchen. Keep your phone nearby.'] : ['Ready for pickup', 'Your order is packed and waiting for you.'],
    completed: o => o.type === 'delivery' ? ['Delivered', 'Enjoy your meal, and thank you for ordering from Butts Kitchen.'] : ['Picked up', 'Enjoy your meal, and thank you for ordering from Butts Kitchen.'],
  };

  function render() {
    const o = order;
    const firstName = o.customer_name.split(' ')[0];
    document.title = `${statusLabel(o.status, o.type)} · Order #${o.number} — Butts Kitchen`;
    const steps = ['new', 'preparing', 'ready', 'completed'];
    const at = s => o.events.filter(e => e.status === s).pop()?.at;
    const idx = steps.indexOf(o.status);
    const cancelled = o.status === 'cancelled';
    const [title, body] = cancelled ? ['Order cancelled', ''] : MESSAGES[o.status](o);

    $('#track').innerHTML = `
      <h1 class="track-hello">${isNew ? `Thank you, ${esc(firstName)}. Your order is in.` : `Hi ${esc(firstName)}, here’s your order.`}</h1>
      <div class="track-meta">
        <span class="track-number">Order #${o.number}</span>
        <span>Placed at ${time(o.created_at)}</span>
        <span>${o.type === 'delivery' ? 'Delivery' : 'Pickup'}</span>
        ${cancelled || o.status === 'completed' ? '' : `<span class="live-dot ${live ? '' : 'off'}">${live ? 'Updating live' : 'Reconnecting…'}</span>`}
      </div>

      <section class="panel" aria-labelledby="statusTitle">
        ${cancelled ? `<div class="cancelled-note"><strong>This order was cancelled.</strong> ${o.cancel_reason ? `Reason: ${esc(o.cancel_reason)}. ` : ''}If this is a surprise, call us on <a href="tel:${BK.PHONE_TEL}">${BK.PHONE}</a>.</div>` : `
        <div class="status-now">
          ${POT.replace('class="pot"', `class="pot ${o.status === 'preparing' ? '' : 'idle'}"`)}
          <div><h2 id="statusTitle">${title}</h2><p>${body}</p></div>
        </div>
        <ol class="timeline">
          ${steps.map((s, i) => {
            const state = i < idx || (i === idx && s === 'completed') ? 'done' : i === idx ? 'current' : '';
            const t = at(s);
            return `<li class="${state}" ${i === idx ? 'aria-current="step"' : ''}>
              <span class="dot" aria-hidden="true">${state === 'done' ? '✓' : i + 1}</span>
              <span class="step-name">${s === 'new' ? 'Order received' : statusLabel(s, o.type)}</span>
              <span class="step-time">${t && i <= idx ? time(t) : ''}</span>
            </li>`;
          }).join('')}
        </ol>`}
      </section>

      <section class="panel" aria-labelledby="itemsTitle">
        <h2 id="itemsTitle">What you ordered</h2>
        <ul class="items">
          ${o.items.map(i => `<li><span>${i.qty} × ${esc(i.name)} <small>${esc(i.variant_label)}</small></span><span>${money(i.line_total)}</span></li>`).join('')}
        </ul>
        <dl class="totals">
          ${o.delivery_fee ? `<div><dt>Subtotal</dt><dd>${money(o.subtotal)}</dd></div><div><dt>Delivery</dt><dd>${money(o.delivery_fee)}</dd></div>` : ''}
          <div class="grand"><dt>Total, pay in cash</dt><dd>${money(o.total)}</dd></div>
        </dl>
      </section>

      <p class="save-note">Keep this page open, or come back to it from the same phone. It updates by itself.</p>
      <div class="track-actions">
        <a class="btn btn-outline" href="tel:${BK.PHONE_TEL}">Call to change your order</a>
        <a class="btn btn-ghost" href="/">Back to the menu</a>
      </div>`;
  }

  function notFound(msg) {
    $('#track').innerHTML = `<h1 class="track-hello">We couldn’t find that order.</h1>
      <p>${esc(msg || 'Check the link you were given.')}</p>
      <div class="track-actions"><a class="btn btn-primary" href="/">Go to the menu</a><a class="btn btn-outline" href="tel:${BK.PHONE_TEL}">Call ${BK.PHONE}</a></div>`;
  }

  // Live connection with automatic fallback to polling
  let pollTimer = null;
  function connect() {
    if (!('EventSource' in window)) return poll();
    const es = new EventSource(`/api/orders/${encodeURIComponent(code)}/stream`);
    es.addEventListener('order', e => {
      const prev = order?.status;
      order = JSON.parse(e.data); live = true; render();
      if (prev && prev !== order.status && navigator.vibrate) navigator.vibrate(120);
      if (['completed', 'cancelled'].includes(order.status)) es.close();
    });
    es.onerror = () => {
      live = false; if (order) render();
      if (es.readyState === EventSource.CLOSED) { es.close(); poll(); }
    };
  }
  async function poll() {
    clearTimeout(pollTimer);
    try { order = (await api(`/api/orders/${encodeURIComponent(code)}`)).order; render(); }
    catch (e) { if (e.status === 404) return notFound(e.message); }
    if (!order || !['completed', 'cancelled'].includes(order.status)) pollTimer = setTimeout(poll, 15000);
  }

  api(`/api/orders/${encodeURIComponent(code)}`)
    .then(d => { order = d.order; render(); if (!['completed', 'cancelled'].includes(order.status)) connect(); })
    .catch(e => e.status === 404 ? notFound(e.message) : ($('#track').innerHTML = `<p class="form-error">${esc(e.message)}</p>`));
})();
