// Kitchen dashboard: live orders, history, sales, menu
(() => {
  const { $, $$, esc, money, api, toast, store, ago, time, dateTime, statusLabel, ICONS } = BK;
  BK.initTheme($('#themeBtn'));
  $$('[data-close]').forEach(b => { if (!b.textContent.trim()) b.innerHTML = ICONS.close; b.addEventListener('click', () => b.closest('dialog').close()); });

  // ------------------------------------------------------------------ sign-in
  async function boot() {
    const { signedIn } = await api('/api/admin/session').catch(() => ({ signedIn: false }));
    signedIn ? startApp() : showLogin();
  }
  function showLogin() {
    $('#app').hidden = true; $('#login').hidden = false;
    stopLive();
    requestAnimationFrame(() => $('#pin').focus());
  }
  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const pin = $('#pin').value.trim();
    if (!pin) { $('#pinErr').textContent = 'Enter the kitchen PIN.'; return; }
    const btn = $('#loginBtn');
    btn.disabled = true; btn.textContent = 'Signing in…';
    try {
      await api('/api/admin/login', { method: 'POST', body: { pin } });
      $('#pin').value = ''; $('#pinErr').textContent = '';
      unlockAudio();
      startApp();
    } catch (err) {
      $('#pinErr').textContent = err.message;
      $('#pin').select();
    } finally { btn.disabled = false; btn.textContent = 'Sign in'; }
  });
  $('#logoutBtn').addEventListener('click', async () => {
    await api('/api/admin/logout', { method: 'POST' }).catch(() => {});
    showLogin();
  });

  let started = false;
  function startApp() {
    $('#login').hidden = true; $('#app').hidden = false;
    if (!started) { started = true; window.addEventListener('hashchange', route); }
    startLive();
    loadSettings();
    route();
  }
  // Any 401 from the API means the session ended
  async function call(url, opts) {
    try { return await api(url, opts); }
    catch (e) { if (e.status === 401) showLogin(); throw e; }
  }

  // ------------------------------------------------------------------ routing
  const VIEWS = ['live', 'history', 'sales', 'menu'];
  function route() {
    const tab = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'live';
    VIEWS.forEach(v => { $(`#view-${v}`).hidden = v !== tab; });
    $$('.tabs a').forEach(a => { if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    if (tab === 'history') loadHistory(true);
    if (tab === 'sales') loadSales();
    if (tab === 'menu') loadMenu();
    window.scrollTo({ top: 0 });
  }

  // ------------------------------------------------------------------ sound
  let soundOn = store.get('bk-sound', true);
  let audioCtx = null;
  function unlockAudio() {
    try { audioCtx ||= new (window.AudioContext || window.webkitAudioContext)(); audioCtx.resume(); } catch { /* no audio */ }
  }
  document.addEventListener('pointerdown', unlockAudio, { once: true });
  function chime() {
    if (!soundOn || !audioCtx) return;
    const t = audioCtx.currentTime;
    [[880, 0], [1320, .18], [1760, .36]].forEach(([f, d]) => {
      const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.3, t + d + .02); g.gain.exponentialRampToValueAtTime(0.0001, t + d + .5);
      o.connect(g).connect(audioCtx.destination); o.start(t + d); o.stop(t + d + .55);
    });
  }
  const SOUND_ON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5L6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/></svg>';
  const SOUND_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5L6 9H2v6h4l5 4V5zM22 9l-6 6M16 9l6 6"/></svg>';
  function syncSound() {
    const b = $('#soundBtn');
    b.innerHTML = soundOn ? SOUND_ON : SOUND_OFF;
    b.setAttribute('aria-pressed', String(soundOn));
    b.setAttribute('aria-label', soundOn ? 'Sound for new orders is on. Turn off' : 'Sound for new orders is off. Turn on');
    b.title = soundOn ? 'New-order sound on' : 'New-order sound off';
  }
  $('#soundBtn').addEventListener('click', () => { soundOn = !soundOn; store.set('bk-sound', soundOn); unlockAudio(); syncSound(); if (soundOn) chime(); });
  syncSound();

  // ------------------------------------------------------------------ live orders
  const active = new Map(); // id -> order
  const fresh = new Set();
  let es = null;
  let unseen = 0;

  function startLive() {
    stopLive();
    es = new EventSource('/api/admin/stream');
    es.addEventListener('hello', e => {
      active.clear();
      JSON.parse(e.data).active.forEach(o => active.set(o.id, o));
      setLive(true); renderBoard();
    });
    es.addEventListener('order-created', e => {
      const o = JSON.parse(e.data);
      active.set(o.id, o); fresh.add(o.id);
      setTimeout(() => fresh.delete(o.id), 4000);
      renderBoard();
      if (o.source === 'web') {
        chime();
        if (document.hidden) { unseen++; updateTitle(); }
        toast(`New order #${o.id} from ${o.customer_name} · ${money(o.total)}`, { action: 'View', onAction: () => { location.hash = '#live'; openOrder(o.id); } });
      }
      refreshIfVisible();
    });
    es.addEventListener('order-updated', e => {
      const o = JSON.parse(e.data);
      if (['new', 'preparing', 'ready'].includes(o.status)) active.set(o.id, o); else active.delete(o.id);
      renderBoard(); refreshIfVisible();
    });
    es.onopen = () => setLive(true);
    es.onerror = async () => {
      setLive(false);
      const { signedIn } = await api('/api/admin/session').catch(() => ({ signedIn: true }));
      if (!signedIn) showLogin();
    };
  }
  function stopLive() { es?.close(); es = null; }
  function setLive(on) {
    const el = $('#liveStatus');
    el.classList.toggle('off', !on);
    el.textContent = on ? 'Live' : 'Reconnecting…';
    el.title = on ? 'New orders appear automatically' : 'Trying to reconnect. Orders will appear once the connection is back.';
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { unseen = 0; updateTitle(); } });
  function updateTitle() { document.title = (unseen ? `(${unseen}) New order — ` : '') + 'Kitchen — Butts Kitchen'; }

  let refreshTimer = null;
  function refreshIfVisible() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      if (!$('#view-sales').hidden) loadSales();
      if (!$('#view-history').hidden) loadHistory(true);
    }, 600);
  }

  const since = (o, status) => o.events.filter(e => e.status === status).pop()?.at || o.created_at;
  function timerFor(o) {
    const now = Date.now();
    const age = Math.floor((now - o.created_at) / 60e3);
    const inStep = Math.floor((now - since(o, o.status)) / 60e3);
    let text, cls = '';
    if (o.status === 'new') { text = `Waiting ${inStep} min`; if (inStep >= 10) cls = 'late'; else if (inStep >= 5) cls = 'warn'; }
    else if (o.status === 'preparing') { text = `Cooking ${inStep} min`; if (age >= 45) cls = 'late'; else if (age >= 30) cls = 'warn'; }
    else { text = `${o.type === 'delivery' ? 'Out' : 'Ready'} ${inStep} min`; if (inStep >= 30) cls = 'warn'; }
    return { text, cls, title: `Placed ${age} min ago at ${time(o.created_at)}` };
  }
  const NEXT_LABEL = o => ({ new: 'Start preparing', preparing: o.type === 'delivery' ? 'Send out' : 'Mark ready', ready: o.type === 'delivery' ? 'Mark delivered' : 'Mark picked up' }[o.status]);

  function ticket(o) {
    const t = timerFor(o);
    return `<article class="ticket ${fresh.has(o.id) ? 'fresh' : ''}" data-id="${o.id}" aria-labelledby="t-${o.id}">
      <div class="ticket-top">
        <button class="ticket-no" id="t-${o.id}" type="button" data-open="${o.id}">#${o.id}</button>
        <span class="timer ${t.cls}" title="${esc(t.title)}">${t.text}</span>
      </div>
      <div class="ticket-who">
        <strong>${esc(o.customer_name)}</strong>
        <a href="tel:${esc(o.phone)}">${esc(o.phone)}</a>
        <span class="chip chip-plain">${o.type === 'delivery' ? 'Delivery' : 'Pickup'}</span>
        ${o.source === 'phone' ? '<span class="chip chip-plain">Phone order</span>' : ''}
      </div>
      <ul class="ticket-items">${o.items.map(i => `<li><b>${i.qty}×</b> ${esc(i.name)} <small>${esc(i.variant_label)}</small></li>`).join('')}</ul>
      ${o.notes ? `<p class="ticket-note"><strong>Note:</strong> ${esc(o.notes)}</p>` : ''}
      ${o.type === 'delivery' && o.address ? `<p class="ticket-addr">${esc(o.address)}</p>` : ''}
      <div class="ticket-foot">
        <span class="ticket-total">${money(o.total)}</span>
        <div class="ticket-actions">
          <button class="btn btn-ghost btn-cancel" type="button" data-cancel="${o.id}" aria-label="Cancel order #${o.id}">Cancel</button>
          <button class="btn btn-primary" type="button" data-next="${o.id}">${NEXT_LABEL(o)}</button>
        </div>
      </div>
    </article>`;
  }

  const EMPTY = { new: 'No new orders. New ones appear here with a chime.', preparing: 'Nothing cooking right now.', ready: 'Nothing waiting to go out.' };
  function renderBoard() {
    const focusedId = document.activeElement?.closest?.('.ticket')?.dataset.id;
    const groups = { new: [], preparing: [], ready: [] };
    [...active.values()].sort((a, b) => a.created_at - b.created_at).forEach(o => groups[o.status]?.push(o));
    for (const [status, list] of Object.entries(groups)) {
      $(`[data-list="${status}"]`).innerHTML = list.length ? list.map(ticket).join('') : `<p class="col-empty">${EMPTY[status]}</p>`;
      $(`[data-count="${status}"]`).textContent = list.length;
    }
    const total = active.size;
    const badge = $('#liveBadge');
    badge.hidden = !groups.new.length; badge.textContent = groups.new.length;
    badge.setAttribute('aria-label', `${groups.new.length} new`);
    const oldest = [...active.values()].reduce((m, o) => Math.min(m, o.created_at), Infinity);
    $('#liveSummary').textContent = total
      ? `${total} ${total === 1 ? 'order' : 'orders'} in progress · oldest placed ${ago(oldest)}`
      : 'All caught up. No orders in progress.';
    if (focusedId) $(`.ticket[data-id="${focusedId}"] [data-next]`)?.focus();
  }
  setInterval(() => { if (!$('#view-live').hidden && active.size) renderBoard(); }, 30e3);

  async function moveOrder(id, status, opts = {}) {
    const before = active.get(id) || null;
    try {
      const { order } = await call(`/api/admin/orders/${id}/status`, { method: 'POST', body: { status, ...opts } });
      if (['new', 'preparing', 'ready'].includes(order.status)) active.set(id, order); else active.delete(id);
      renderBoard();
      return { order, before };
    } catch (e) { toast(e.message, { error: true }); throw e; }
  }

  document.addEventListener('click', async e => {
    const next = e.target.closest('[data-next]');
    const cancel = e.target.closest('[data-cancel]');
    const open = e.target.closest('[data-open]');
    if (next) {
      const id = Number(next.dataset.next);
      next.disabled = true;
      try {
        const { order, before } = await moveOrder(id, 'next');
        $('#orderDialog').open && openOrder(id);
        toast(`Order #${id}: ${statusLabel(order.status, order.type)}.`, {
          action: 'Undo', onAction: () => moveOrder(id, before.status).then(() => $('#orderDialog').open && openOrder(id)),
        });
      } catch { next.disabled = false; }
    } else if (cancel) {
      askCancel(Number(cancel.dataset.cancel));
    } else if (open) {
      openOrder(Number(open.dataset.open));
    }
  });

  // ------------------------------------------------------------------ cancel
  let cancelId = null;
  function askCancel(id) {
    cancelId = id;
    const o = active.get(id) || historyCache.get(id);
    $('#cancelTitle').textContent = `Cancel order #${id}?`;
    $('#cancelText').textContent = o ? `${o.customer_name} · ${money(o.total)}. Their tracking page will show that the order was cancelled.` : '';
    $('#cr1').checked = true;
    $('#cancelDialog').showModal();
  }
  $('#cancelForm').addEventListener('submit', async e => {
    e.preventDefault();
    const reason = $('#cancelForm input[name="reason"]:checked').value;
    const id = cancelId;
    try {
      const { before } = await moveOrder(id, 'cancelled', { reason });
      $('#cancelDialog').close();
      $('#orderDialog').open && openOrder(id);
      toast(`Order #${id} cancelled.`, { action: 'Undo', onAction: () => moveOrder(id, before.status).then(() => $('#orderDialog').open && openOrder(id)) });
    } catch { /* toast shown */ }
  });

  // ------------------------------------------------------------------ order details
  const historyCache = new Map();
  async function openOrder(id) {
    let o = active.get(id) || historyCache.get(id);
    try { o = (await call(`/api/admin/orders?q=${id}&limit=1`)).orders.find(x => x.id === id) || o; } catch { /* use cache */ }
    if (!o) return;
    historyCache.set(id, o);
    $('#orderDialogTitle').innerHTML = `Order #${o.id} <span class="chip chip-${o.status}">${statusLabel(o.status, o.type)}</span>`;
    $('#orderDialogBody').innerHTML = `
      <dl class="detail-grid">
        <dt>Customer</dt><dd>${esc(o.customer_name)}</dd>
        <dt>Phone</dt><dd><a href="tel:${esc(o.phone)}">${esc(o.phone)}</a></dd>
        <dt>Type</dt><dd>${o.type === 'delivery' ? 'Delivery' : 'Pickup'}${o.source === 'phone' ? ' · taken by phone' : ' · ordered online'}</dd>
        ${o.address ? `<dt>Address</dt><dd>${esc(o.address)}</dd>` : ''}
        ${o.notes ? `<dt>Notes</dt><dd>${esc(o.notes)}</dd>` : ''}
        ${o.cancel_reason ? `<dt>Cancelled</dt><dd>${esc(o.cancel_reason)}</dd>` : ''}
      </dl>
      <ul class="detail-items">${o.items.map(i => `<li><span>${i.qty} × ${esc(i.name)} <span class="hint">${esc(i.variant_label)}</span></span><span>${money(i.line_total)}</span></li>`).join('')}</ul>
      ${o.delivery_fee ? `<div class="detail-items"><li><span>Delivery fee</span><span>${money(o.delivery_fee)}</span></li></div>` : ''}
      <div class="detail-total"><span>Total</span><span>${money(o.total)}</span></div>
      <div><h3 class="section-title" style="font-size:1rem">Timeline</h3>
        <ol class="events">${o.events.map(ev => `<li>${dateTime(ev.at)} · ${ev.status === 'new' ? 'Order placed' : statusLabel(ev.status, o.type)}</li>`).join('')}</ol></div>`;
    const canMove = ['new', 'preparing', 'ready'].includes(o.status);
    $('#orderDialogFoot').innerHTML = canMove
      ? `<button class="btn btn-danger" type="button" data-cancel="${o.id}">Cancel order</button><button class="btn btn-primary" type="button" data-next="${o.id}">${NEXT_LABEL(o)}</button>`
      : `<a class="btn btn-ghost" href="/track/${encodeURIComponent(o.code)}" target="_blank" rel="noopener">Open customer tracking page</a><button class="btn btn-outline" type="button" data-close-dialog>Close</button>`;
    $('#orderDialogFoot [data-close-dialog]')?.addEventListener('click', () => $('#orderDialog').close());
    if (!$('#orderDialog').open) $('#orderDialog').showModal();
  }

  // ------------------------------------------------------------------ phone order
  let menuCache = null;
  const phoneCart = new Map(); // variant_id -> qty
  async function getMenu() { menuCache = await call('/api/admin/menu'); return menuCache; }
  $('#phoneOrderBtn').addEventListener('click', async () => {
    await getMenu();
    phoneCart.clear();
    $('#phoneForm').reset();
    $$('#phoneForm .field').forEach(f => f.classList.remove('invalid'));
    $('#pAddressField').hidden = false;
    renderPicker();
    $('#phoneDialog').showModal();
    $('#pName').focus();
  });
  $$('input[name="ptype"]').forEach(r => r.addEventListener('change', () => { $('#pAddressField').hidden = $('#pPick').checked; updatePhoneTotal(); }));
  function renderPicker() {
    $('#picker').innerHTML = menuCache.menu.flatMap(item => item.variants.map(v => {
      const q = phoneCart.get(v.id) || 0;
      return `<div class="pick-row"><div><span class="pname">${esc(item.name)}</span><small>${esc(v.label)} · ${money(v.price)}${item.available ? '' : ' · sold out online'}</small></div>
        <div class="stepper" role="group" aria-label="Quantity of ${esc(item.name)}, ${esc(v.label)}">
          <button type="button" data-pdec="${v.id}" aria-label="Remove one">−</button><output>${q}</output><button type="button" data-pinc="${v.id}" aria-label="Add one">+</button>
        </div></div>`;
    })).join('');
    updatePhoneTotal();
  }
  function updatePhoneTotal() {
    if (!menuCache) return;
    const prices = new Map(menuCache.menu.flatMap(i => i.variants.map(v => [v.id, v.price])));
    let sum = 0; phoneCart.forEach((q, id) => { sum += (prices.get(id) || 0) * q; });
    const fee = $('#pDel').checked && sum ? menuCache.settings.delivery_fee : 0;
    $('#phoneTotal').textContent = `Total ${money(sum + fee)}`;
  }
  $('#picker').addEventListener('click', e => {
    const inc = e.target.closest('[data-pinc]'); const dec = e.target.closest('[data-pdec]');
    if (!inc && !dec) return;
    const id = Number((inc || dec).dataset.pinc || (inc || dec).dataset.pdec);
    const q = Math.max(0, (phoneCart.get(id) || 0) + (inc ? 1 : -1));
    q ? phoneCart.set(id, q) : phoneCart.delete(id);
    (inc || dec).parentElement.querySelector('output').textContent = q;
    updatePhoneTotal();
  });
  $('#phoneForm').addEventListener('submit', async e => {
    e.preventDefault();
    const body = {
      customer_name: $('#pName').value, phone: $('#pPhone').value, type: $('#pDel').checked ? 'delivery' : 'pickup',
      address: $('#pAddress').value, notes: $('#pNotes').value,
      lines: [...phoneCart].map(([variant_id, qty]) => ({ variant_id, qty })),
    };
    const btn = $('#phoneSubmit'); btn.disabled = true;
    try {
      const { order } = await call('/api/admin/orders', { method: 'POST', body });
      $('#phoneDialog').close();
      toast(`Order #${order.id} added for ${order.customer_name}.`);
    } catch (err) {
      $$('#phoneForm .field[data-field]').forEach(f => {
        const msg = err.fields?.[f.dataset.field];
        f.classList.toggle('invalid', !!msg);
        f.querySelector('.error').textContent = msg || '';
      });
      if (!err.fields) toast(err.message, { error: true });
      $('#phoneForm .field.invalid input')?.focus();
    } finally { btn.disabled = false; }
  });

  // ------------------------------------------------------------------ history
  let hOffset = 0;
  const PAGE = 25;
  function rangeBounds(range) {
    const now = new Date();
    const sod = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const today = sod(now);
    switch (range) {
      case 'today': return { from: today };
      case 'yesterday': return { from: sod(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)), to: today };
      case '7': return { from: sod(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)) };
      case 'month': return { from: new Date(now.getFullYear(), now.getMonth(), 1).getTime() };
      default: return {};
    }
  }
  function historyQuery(extra = {}) {
    const range = $('#filters input[name="range"]:checked').value;
    const p = new URLSearchParams();
    const b = rangeBounds(range);
    if (b.from) p.set('from', b.from);
    if (b.to) p.set('to', b.to);
    if ($('#statusFilter').value) p.set('status', $('#statusFilter').value);
    if ($('#searchInput').value.trim()) p.set('q', $('#searchInput').value.trim());
    Object.entries(extra).forEach(([k, v]) => p.set(k, v));
    return p;
  }
  async function loadHistory(reset) {
    if (reset) hOffset = 0;
    const p = historyQuery({ limit: PAGE, offset: hOffset });
    $('#csvBtn').href = '/api/admin/orders.csv?' + historyQuery().toString();
    try {
      const data = await call('/api/admin/orders?' + p);
      data.orders.forEach(o => historyCache.set(o.id, o));
      const rows = data.orders.map(o => `<tr data-row="${o.id}">
        <td data-col="order"><button class="row-link" type="button" data-open="${o.id}">#${o.id}</button>${o.source === 'phone' ? '<span class="sub">Phone</span>' : ''}</td>
        <td data-col="placed">${dateTime(o.created_at)}</td>
        <td data-col="customer">${esc(o.customer_name)}<span class="sub">${esc(o.phone)}</span></td>
        <td data-col="items" class="items-cell">${o.items.map(i => `${i.qty}× ${esc(i.name)}`).join(', ')}</td>
        <td data-col="type">${o.type === 'delivery' ? 'Delivery' : 'Pickup'}</td>
        <td data-col="status"><span class="chip chip-${o.status}">${statusLabel(o.status, o.type)}</span></td>
        <td class="num">${money(o.total)}</td></tr>`).join('');
      if (reset) $('#historyBody').innerHTML = rows || '<tr class="empty"><td colspan="7">No orders match these filters. Try a wider date range or clear the search.</td></tr>';
      else $('#historyBody').insertAdjacentHTML('beforeend', rows);
      hOffset += data.orders.length;
      $('#moreBtn').hidden = hOffset >= data.total;
      $('#historySummary').textContent = `${data.total.toLocaleString()} ${data.total === 1 ? 'order' : 'orders'} · ${money(data.revenue)} in sales (cancelled orders not counted)`;
    } catch (e) { if (e.status !== 401) toast(e.message, { error: true }); }
  }
  $('#moreBtn').addEventListener('click', () => loadHistory(false));
  $('#filters').addEventListener('change', () => loadHistory(true));
  $('#filters').addEventListener('submit', e => e.preventDefault());
  let searchT; $('#searchInput').addEventListener('input', () => { clearTimeout(searchT); searchT = setTimeout(() => loadHistory(true), 300); });
  $('#historyBody').addEventListener('click', e => {
    if (e.target.closest('a, button')) return;
    const row = e.target.closest('[data-row]'); if (row) openOrder(Number(row.dataset.row));
  });

  // ------------------------------------------------------------------ sales
  let monthOffset = 0; // 0 = this month, -1 = last month …
  const short = n => n >= 1e5 ? `${(n / 1e3).toFixed(0)}k` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k` : String(n);
  function delta(now, before, unit = 'money') {
    if (!before) return now ? '<span class="delta">No sales to compare yet</span>' : '';
    const pct = Math.round(((now - before) / before) * 100);
    const cls = pct > 0 ? 'up' : pct < 0 ? 'down' : '';
    const arrow = pct > 0 ? '▲' : pct < 0 ? '▼' : '';
    return `<span class="${cls}">${arrow} ${Math.abs(pct)}%</span>`;
  }
  function tile(label, value, sub = '', hero = false) {
    return `<div class="tile ${hero ? 'hero' : ''}"><span class="label">${label}</span><span class="value">${value}</span>${sub ? `<span class="delta">${sub}</span>` : ''}</div>`;
  }
  async function loadSales() {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + monthOffset);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    let s;
    try { s = await call(`/api/admin/stats?month=${month}`); } catch (e) { if (e.status !== 401) toast(e.message, { error: true }); return; }
    $('#salesUpdated').textContent = `Updated ${time(s.generated_at)}. Cancelled orders are not counted.`;
    const y = s.yesterdaySameTime;
    $('#todayTiles').innerHTML =
      tile('Sales today', money(s.today.revenue), `${delta(s.today.revenue, y.revenue)} vs yesterday at this time`, true) +
      tile('Orders today', s.today.orders, `${y.orders} by this time yesterday`) +
      tile('Average order', money(s.today.avg), s.today.cancelled ? `${s.today.cancelled} cancelled today` : 'No cancellations today') +
      tile('In the kitchen now', s.active, s.active ? '<a href="#live">Go to live orders</a>' : 'All caught up');

    const m = s.month;
    const monthName = new Date(m.year, m.month - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    $('#monthTitle').textContent = m.isCurrentMonth ? `This month, ${monthName}` : monthName;
    $('#nextMonth').disabled = monthOffset >= 0;
    const vs = m.isCurrentMonth ? 'vs the same days last month' : 'vs the month before';
    $('#monthTiles').innerHTML =
      tile(m.isCurrentMonth ? 'Sales so far' : 'Sales', money(m.revenue), `${delta(m.revenue, m.previous.revenue)} ${vs}`, true) +
      tile('Orders', m.orders.toLocaleString(), `${delta(m.orders, m.previous.orders)} ${vs}`) +
      tile('Average order', money(m.avg), `${money(m.previous.avg)} the month before`) +
      tile('Cancelled', m.cancelled, m.orders + m.cancelled ? `${Math.round((m.cancelled / (m.orders + m.cancelled)) * 100)}% of all orders` : '');

    drawDaily(m);
    drawHours(s.hours);
    drawTopItems(m.topItems);
    drawSplits(m.split);
  }
  $('#prevMonth').addEventListener('click', () => { monthOffset--; loadSales(); });
  $('#nextMonth').addEventListener('click', () => { if (monthOffset < 0) { monthOffset++; loadSales(); } });
  $$('.table-toggle').forEach(b => b.addEventListener('click', () => {
    const t = $('#' + b.dataset.table); t.hidden = !t.hidden;
    b.textContent = t.hidden ? 'Show as table' : 'Hide table';
  }));

  function niceMax(v) {
    if (v <= 0) return 1000;
    const p = 10 ** Math.floor(Math.log10(v));
    return [1, 2, 2.5, 5, 10].map(x => x * p).find(x => x >= v);
  }
  function barPath(x, y, w, h, base) {
    const r = Math.min(4, w / 2, h);
    return `M${x},${base}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${base}Z`;
  }
  // Column chart with hover/focus tooltips. cols: [{ label, value, tip, highlight, dim, tick }]
  function columnChart(el, cols, { height = 220, money: isMoney = true, highlightLabel } = {}) {
    const W = Math.max(280, Math.round(el.clientWidth || 800)), H = height, padL = 52, padR = 8, padT = 22, padB = 26;
    el._redraw = () => columnChart(el, cols, { height, money: isMoney, highlightLabel });
    const max = niceMax(Math.max(...cols.map(c => c.value)));
    const band = (W - padL - padR) / cols.length;
    const bw = Math.max(3, Math.min(28, band * 0.7));
    const y = v => padT + (H - padT - padB) * (1 - v / max);
    const ticks = [0, max / 2, max];
    let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(el.dataset.label || '')}">
      <g class="grid">${ticks.map(t => `<line x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}"/>`).join('')}</g>
      <g class="axis">${ticks.map(t => `<text x="${padL - 8}" y="${y(t) + 4}" text-anchor="end">${isMoney ? 'Rs ' + short(t) : t}</text>`).join('')}
      ${cols.map((c, i) => c.tick ? `<text x="${padL + band * i + band / 2}" y="${H - 6}" text-anchor="middle">${esc(c.tick)}</text>` : '').join('')}</g>`;
    cols.forEach((c, i) => {
      const x = padL + band * i + (band - bw) / 2;
      const h = Math.max(0, y(0) - y(c.value));
      svg += `<rect class="hit" x="${padL + band * i}" y="${padT}" width="${band}" height="${H - padT - padB}" tabindex="0" data-tip="${esc(c.tip)}" aria-label="${esc(c.tip.replace(/\|/g, ', '))}"/>`;
      svg += c.value > 0 ? `<path class="bar ${c.dim ? 'dim' : ''}" d="${barPath(x, y(c.value), bw, h, y(0))}"/>` : '<g></g>';
      if (c.highlight && highlightLabel) svg += `<text class="today-label" x="${x + bw / 2}" y="${y(c.value) - 6}" text-anchor="middle">${highlightLabel}</text>`;
    });
    el.innerHTML = svg + '</svg>';
  }
  let resizeT;
  window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => $$('.chart').forEach(c => c._redraw?.()), 150); });
  // Shared tooltip
  const tip = $('#chartTip');
  function showTip(target) {
    const [a, b] = target.dataset.tip.split('|');
    tip.innerHTML = `<strong>${esc(a)}</strong>${esc(b || '')}`;
    const r = target.getBoundingClientRect();
    tip.style.left = `${Math.min(Math.max(r.left + r.width / 2, 80), innerWidth - 80)}px`;
    tip.style.top = `${r.top + 16}px`;
    tip.hidden = false;
  }
  document.addEventListener('pointerover', e => { const t = e.target.closest('.hit'); if (t) showTip(t); });
  document.addEventListener('pointerout', e => { if (e.target.closest('.hit')) tip.hidden = true; });
  document.addEventListener('focusin', e => { const t = e.target.closest('.hit'); t ? showTip(t) : (tip.hidden = true); });
  window.addEventListener('scroll', () => { tip.hidden = true; }, { passive: true });

  function drawDaily(m) {
    const now = new Date();
    const isToday = day => m.isCurrentMonth && day === now.getDate();
    const cols = m.daily.map(d => {
      const date = new Date(m.year, m.month - 1, d.day);
      const future = m.isCurrentMonth && d.day > now.getDate();
      return {
        value: d.revenue, highlight: isToday(d.day), dim: false,
        tick: d.day === 1 || d.day % 5 === 0 ? String(d.day) : '',
        tip: future ? `${date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}|Still to come`
          : `${money(d.revenue)}|${date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · ${d.orders} ${d.orders === 1 ? 'order' : 'orders'}`,
      };
    });
    $('#dailyChart').dataset.label = `Sales by day, ${m.month}/${m.year}`;
    columnChart($('#dailyChart'), cols, { highlightLabel: 'Today' });
    $('#dailyTable').innerHTML = `<table><thead><tr><th>Date</th><th>Orders</th><th>Sales</th></tr></thead><tbody>${
      m.daily.filter(d => d.orders).map(d => `<tr><td>${new Date(m.year, m.month - 1, d.day).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</td><td>${d.orders}</td><td>${money(d.revenue)}</td></tr>`).join('') || '<tr><td colspan="3">No sales this month yet.</td></tr>'
    }</tbody></table>`;
  }
  function drawHours(hours) {
    let lo = 11, hi = 23;
    hours.forEach((n, h) => { if (n) { lo = Math.min(lo, h); hi = Math.max(hi, h); } });
    const fmt = h => { const s = h % 12 || 12; return `${s}${h < 12 || h === 24 ? 'am' : 'pm'}`; };
    const cols = [];
    for (let h = lo; h <= hi; h++) cols.push({ value: hours[h], tick: h % 3 === 0 ? fmt(h) : '', tip: `${hours[h]} ${hours[h] === 1 ? 'order' : 'orders'}|${fmt(h)}–${fmt(h + 1)}` });
    if (!hours.some(Boolean)) { $('#hoursChart').innerHTML = '<p class="empty-chart">Not enough orders yet.</p>'; return; }
    $('#hoursChart').dataset.label = 'Orders by hour of day, last 30 days';
    columnChart($('#hoursChart'), cols, { height: 200, money: false });
  }
  function hbars(rows) {
    const max = Math.max(...rows.map(r => r.value), 1);
    return `<ul class="hbars">${rows.map(r => `<li>
      <div class="hbar-label"><span>${esc(r.label)}${r.sub ? ` <small>${esc(r.sub)}</small>` : ''}</span><span>${esc(r.display)}</span></div>
      <div class="hbar-track" aria-hidden="true"><div class="hbar-fill" style="width:${(r.value / max) * 100}%"></div></div></li>`).join('')}</ul>`;
  }
  function drawTopItems(items) {
    $('#topItems').innerHTML = items.length
      ? hbars(items.map(i => ({ label: i.name, sub: `${i.qty} sold`, value: i.revenue, display: money(i.revenue) })))
      : '<p class="empty-chart">No dishes sold this month yet.</p>';
  }
  function drawSplits(s) {
    const total = s.pickup + s.delivery;
    if (!total) { $('#splits').innerHTML = '<p class="empty-chart">No orders this month yet.</p>'; return; }
    const pct = n => `${Math.round((n / total) * 100)}% · ${n}`;
    $('#splits').innerHTML = `
      <div class="split-group"><h4>Delivery or pickup</h4>${hbars([
        { label: 'Delivery', value: s.delivery, display: pct(s.delivery) }, { label: 'Pickup', value: s.pickup, display: pct(s.pickup) }])}</div>
      <div class="split-group"><h4>Where the order was placed</h4>${hbars([
        { label: 'Online', value: s.web, display: pct(s.web) }, { label: 'By phone', value: s.phone, display: pct(s.phone) }])}</div>`;
  }

  // ------------------------------------------------------------------ menu + settings
  async function loadSettings() {
    try {
      const { settings } = await getMenu();
      $('#openSwitch').checked = settings.kitchen_open;
      syncOpenLabel();
      $('#feeInput').value = settings.delivery_fee;
    } catch { /* handled */ }
  }
  function syncOpenLabel() { $('#openLabel').textContent = $('#openSwitch').checked ? 'Taking online orders' : 'Online orders paused'; }
  $('#openSwitch').addEventListener('change', async e => {
    const open = e.target.checked; syncOpenLabel();
    try {
      await call('/api/admin/settings', { method: 'POST', body: { kitchen_open: open } });
      toast(open ? 'Online orders are on. Customers can order again.' : 'Online orders paused. Customers see a message to call instead.');
    } catch (err) { e.target.checked = !open; syncOpenLabel(); toast(err.message, { error: true }); }
  });
  $('#settingsForm').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const { settings } = await call('/api/admin/settings', { method: 'POST', body: { delivery_fee: $('#feeInput').value } });
      toast(settings.delivery_fee ? `Delivery fee saved: ${money(settings.delivery_fee)}.` : 'Delivery is now free.');
    } catch (err) { toast(err.message, { error: true }); }
  });

  async function loadMenu() {
    let data;
    try { data = await getMenu(); } catch { return; }
    $('#feeInput').value = data.settings.delivery_fee;
    const cats = [...new Set(data.menu.map(i => i.category))];
    $('#menuEditor').innerHTML = cats.map(c => `<section class="menu-cat"><h2>${esc(c)}</h2><ul class="menu-rows">${
      data.menu.filter(i => i.category === c).map(i => `<li class="menu-row ${i.available ? '' : 'off'}" data-item="${i.id}">
        <div><div class="menu-name">${esc(i.name)}</div>
          <div class="prices">${i.variants.map(v => `<label class="price-edit">${esc(v.label)} Rs.
            <input class="input" type="number" inputmode="numeric" min="1" value="${v.price}" data-variant="${v.id}" data-was="${v.price}" aria-label="Price for ${esc(i.name)}, ${esc(v.label)}"></label>`).join('')}</div></div>
        <label class="switch"><input type="checkbox" data-avail="${i.id}" ${i.available ? 'checked' : ''}><span class="track"></span><span>${i.available ? 'Available' : 'Sold out'}</span></label>
      </li>`).join('')}</ul></section>`).join('');
  }
  $('#menuEditor').addEventListener('change', async e => {
    const avail = e.target.closest('[data-avail]');
    const price = e.target.closest('[data-variant]');
    if (avail) {
      const on = avail.checked, row = avail.closest('.menu-row'), name = row.querySelector('.menu-name').textContent;
      avail.nextElementSibling.nextElementSibling.textContent = on ? 'Available' : 'Sold out';
      row.classList.toggle('off', !on);
      try {
        await call(`/api/admin/menu/items/${avail.dataset.avail}/availability`, { method: 'POST', body: { available: on } });
        toast(on ? `${name} is back on the menu.` : `${name} marked sold out. Customers can’t order it online.`);
      } catch (err) { avail.checked = !on; row.classList.toggle('off', on); toast(err.message, { error: true }); }
    }
    if (price) {
      const value = Number(price.value);
      if (value === Number(price.dataset.was)) return;
      try {
        await call(`/api/admin/menu/variants/${price.dataset.variant}/price`, { method: 'POST', body: { price: value } });
        price.dataset.was = value;
        toast(`Price saved: ${money(value)}.`);
      } catch (err) { price.value = price.dataset.was; toast(err.message, { error: true }); }
    }
  });
  $('#menuEditor').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('[data-variant]')) e.target.blur(); });

  boot();
})();
