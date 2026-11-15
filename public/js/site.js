// Customer ordering page
(() => {
  const { $, $$, esc, money, api, toast, store, ICONS } = BK;
  BK.initTheme($('#themeBtn'));
  $('.call-icon').innerHTML = ICONS.phone;
  $('#cartClose').innerHTML = ICONS.close;
  $('#cartBack').innerHTML = ICONS.back;

  let menu = [];
  let settings = { delivery_fee: 0, kitchen_open: true };
  const variantIndex = new Map(); // variant_id -> { item, variant }
  const selected = new Map();     // item_id -> variant_id
  let cart = store.get('bk-cart', []); // [{ variant_id, qty }]
  let step = 'items';

  // ---------- Recent order link
  const recent = store.get('bk-orders', []);
  if (recent.length) {
    const last = recent[0];
    if (Date.now() - last.at < 12 * 3600e3) {
      const link = $('#trackLink');
      link.href = `/track/${encodeURIComponent(last.code)}`;
      link.hidden = false;
    }
  }

  // ---------- Load menu
  async function load() {
    try {
      const data = await api('/api/menu');
      menu = data.menu; settings = data.settings;
      menu.forEach(item => item.variants.forEach(v => variantIndex.set(v.id, { item, variant: v })));
      cart = cart.filter(l => variantIndex.has(l.variant_id));
      $('#closedBanner').hidden = settings.kitchen_open;
      renderFeature(); renderMenu(); renderCart(); prefillDetails();
    } catch (e) {
      $('#menuSections').innerHTML = `<p class="form-error">We couldn’t load the menu. ${esc(e.message)} <button class="btn btn-outline" type="button" id="retry">Try again</button></p>`;
      $('#retry').onclick = load;
      $('#featureBody').innerHTML = '';
    }
  }

  const qtyInCart = vid => cart.find(l => l.variant_id === vid)?.qty || 0;
  const selectedVariant = item => selected.get(item.id) ?? item.variants[0].id;

  function buyControls(item) {
    const vid = selectedVariant(item);
    const qty = qtyInCart(vid);
    if (!item.available) return '<span class="tag-out">Sold out today</span>';
    if (qty) {
      return `<div class="stepper" role="group" aria-label="Quantity of ${esc(item.name)}">
        <button type="button" data-dec="${vid}" aria-label="Remove one">−</button>
        <output aria-live="polite">${qty}</output>
        <button type="button" data-inc="${vid}" aria-label="Add one more">+</button></div>`;
    }
    return `<button class="btn btn-primary" type="button" data-add="${vid}" aria-label="Add ${esc(item.name)} to your order">Add</button>`;
  }

  function portionPicker(item, idPrefix) {
    if (item.variants.length === 1) {
      const v = item.variants[0];
      return `<p class="single-portion">${esc(v.label)}${v.note ? ` <small>(${esc(v.note)})</small>` : ''}</p>`;
    }
    const sel = selectedVariant(item);
    return `<fieldset class="portions segmented" style="border:0;padding:0;margin-inline:0">
      <legend class="sr-only">Portion size for ${esc(item.name)}</legend>
      ${item.variants.map(v => `
        <input type="radio" name="${idPrefix}-${item.id}" id="${idPrefix}-${v.id}" value="${v.id}" data-item="${item.id}" ${v.id === sel ? 'checked' : ''}>
        <label for="${idPrefix}-${v.id}">${esc(v.label)}${v.note ? ` <small>${esc(v.note)}</small>` : ''}</label>`).join('')}
    </fieldset>`;
  }

  function renderFeature() {
    const item = menu.find(i => i.slug === 'chicken-karahi') || menu.find(i => i.is_new) || menu[0];
    if (!item) return;
    const v = variantIndex.get(selectedVariant(item)).variant;
    $('#feature').dataset.item = item.id;
    $('#featureBody').innerHTML = `
      ${item.is_new ? '<span class="tag-new" style="justify-self:start">New on the menu</span>' : ''}
      <h2>${esc(item.name)}</h2>
      <p class="desc">${esc(item.description)}</p>
      ${portionPicker(item, 'f')}
      <div class="feature-row"><span class="price">${money(v.price)}</span><span class="buy" data-buy="${item.id}">${buyControls(item)}</span></div>`;
  }

  function renderMenu() {
    const cats = [...new Set(menu.map(i => i.category))];
    const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    $('#cats').innerHTML = cats.map((c, i) => `<a href="#cat-${slug(c)}" ${i === 0 ? 'aria-current="true"' : ''}>${esc(c)}</a>`).join('');
    $('#menuSections').innerHTML = cats.map(c => `
      <section class="menu-section" id="cat-${slug(c)}" aria-labelledby="h-${slug(c)}">
        <h2 id="h-${slug(c)}">${esc(c)}</h2>
        <ul class="dishes">
          ${menu.filter(i => i.category === c).map(item => {
            const v = variantIndex.get(selectedVariant(item)).variant;
            return `<li class="dish ${item.available ? '' : 'sold-out'}" data-item="${item.id}">
              <div>
                <h3>${esc(item.name)} ${item.is_new && c !== 'New additions' ? '<span class="tag-new">New</span>' : ''}</h3>
                <p class="desc">${esc(item.description)}</p>
                ${item.available ? portionPicker(item, 'm') : ''}
              </div>
              <div class="dish-buy">
                <span class="price" data-price="${item.id}">${money(v.price)}</span>
                <span class="buy" data-buy="${item.id}">${buyControls(item)}</span>
              </div>
            </li>`;
          }).join('')}
        </ul>
      </section>`).join('');
    setupScrollSpy();
  }

  // Re-render only the parts that depend on the item (price + buttons), keeping focus where it was.
  function refreshItem(itemId, focusSel) {
    const item = menu.find(i => i.id === itemId);
    if (!item) return;
    const v = variantIndex.get(selectedVariant(item)).variant;
    $$(`[data-price="${itemId}"]`).forEach(el => { el.textContent = money(v.price); });
    $$(`[data-buy="${itemId}"]`).forEach(el => { el.innerHTML = buyControls(item); });
    $$(`input[data-item="${itemId}"]`).forEach(r => { r.checked = Number(r.value) === v.id; });
    if ($('#feature').dataset.item == itemId) $('#feature .price').textContent = money(v.price);
    if (focusSel) requestAnimationFrame(() => $(focusSel)?.focus());
  }

  // ---------- Events on menu + feature
  document.addEventListener('change', e => {
    const r = e.target.closest('input[data-item]');
    if (!r) return;
    selected.set(Number(r.dataset.item), Number(r.value));
    refreshItem(Number(r.dataset.item));
  });

  document.addEventListener('click', e => {
    const add = e.target.closest('[data-add]');
    const inc = e.target.closest('[data-inc]');
    const dec = e.target.closest('[data-dec]');
    const del = e.target.closest('[data-remove]');
    if (!add && !inc && !dec && !del) return;
    const el = add || inc || dec || del;
    const vid = Number(el.dataset.add ?? el.dataset.inc ?? el.dataset.dec ?? el.dataset.remove);
    const inSheet = !!e.target.closest('#cart');
    const scope = e.target.closest('[data-buy]') ? `[data-buy="${e.target.closest('[data-buy]').dataset.buy}"]` : null;
    const inFeature = !!e.target.closest('#feature');
    if (add || inc) changeQty(vid, +1, !!add);
    else if (dec) changeQty(vid, -1);
    else changeQty(vid, -Infinity);
    // keep keyboard focus on an equivalent control
    if (!inSheet && scope) {
      const root = inFeature ? '#feature ' : '.dish ';
      const sel = qtyInCart(vid) ? `${root}${scope} [data-${dec ? 'dec' : 'inc'}]` : `${root}${scope} [data-add]`;
      requestAnimationFrame(() => $(sel)?.focus());
    }
  });

  function changeQty(vid, delta, fresh = false) {
    const line = cart.find(l => l.variant_id === vid);
    const { item, variant } = variantIndex.get(vid);
    if (line) {
      line.qty = Math.max(0, Math.min(50, line.qty + delta));
      if (!line.qty) {
        cart = cart.filter(l => l !== line);
        toast(`Removed ${item.name} from your order.`, { action: 'Undo', onAction: () => { cart.push({ variant_id: vid, qty: 1 }); save(); } });
      }
    } else if (delta > 0) {
      cart.push({ variant_id: vid, qty: 1 });
    }
    if (fresh) {
      const label = item.variants.length > 1 ? `${item.name} (${variant.label})` : item.name;
      toast(`Added ${label}.`, { action: window.innerWidth <= 1000 ? 'View order' : undefined, onAction: openCart, duration: 3000 });
    }
    save();
  }

  function save() {
    store.set('bk-cart', cart);
    menu.forEach(i => refreshItem(i.id));
    renderCart();
  }

  // ---------- Cart rendering
  function totals() {
    const subtotal = cart.reduce((s, l) => s + variantIndex.get(l.variant_id).variant.price * l.qty, 0);
    const type = $('input[name="type"]:checked')?.value || 'delivery';
    const fee = type === 'delivery' && cart.length ? settings.delivery_fee : 0;
    return { subtotal, fee, total: subtotal + fee, count: cart.reduce((s, l) => s + l.qty, 0) };
  }

  function renderCart() {
    const t = totals();
    const empty = !cart.length;
    $('#cartEmpty').hidden = !empty;
    $('#cartFoot').hidden = empty;
    if (empty && step === 'details') setStep('items');
    $('#cartLines').innerHTML = cart.map(l => {
      const { item, variant } = variantIndex.get(l.variant_id);
      return `<li class="cart-line">
        <div><div class="name">${esc(item.name)}</div><div class="variant">${esc(variant.label)} · ${money(variant.price)} each</div></div>
        <div class="line-total">${money(variant.price * l.qty)}</div>
        <div class="stepper" role="group" aria-label="Quantity of ${esc(item.name)}, ${esc(variant.label)}">
          <button type="button" data-dec="${l.variant_id}" aria-label="Remove one">−</button>
          <output>${l.qty}</output>
          <button type="button" data-inc="${l.variant_id}" aria-label="Add one more">+</button>
        </div>
        <button class="btn btn-ghost" type="button" data-remove="${l.variant_id}" style="justify-self:end">Remove</button>
      </li>`;
    }).join('');
    $('#tSubtotal').textContent = money(t.subtotal);
    $('#tFeeRow').hidden = !t.fee;
    $('#tFee').textContent = money(t.fee);
    $('#tTotal').textContent = money(t.total);
    $('#cartBar').hidden = empty;
    document.body.classList.toggle('has-cart', !empty);
    $('#cartBarCount').textContent = t.count;
    $('#cartBarTotal').textContent = money(t.total);
    $('#cartTitle').textContent = empty ? 'Your order' : `Your order (${t.count} ${t.count === 1 ? 'item' : 'items'})`;
    updateAction();
  }

  function updateAction() {
    const btn = $('#cartAction');
    if (!settings.kitchen_open) { btn.disabled = true; btn.textContent = 'Online orders are paused'; return; }
    btn.disabled = false;
    btn.textContent = step === 'items' ? 'Continue to your details' : `Place order · ${money(totals().total)}`;
  }

  function setStep(next) {
    step = next;
    const details = next === 'details';
    $('#viewItems').hidden = details;
    $('#viewDetails').hidden = !details;
    $('#cartBack').hidden = !details;
    $('#payNote').hidden = !details;
    $('#stepOrder').className = details ? 'is-done' : 'is-current';
    $('#stepDetails').className = details ? 'is-current' : '';
    $('#stepOrder').removeAttribute('aria-current'); $('#stepDetails').removeAttribute('aria-current');
    (details ? $('#stepDetails') : $('#stepOrder')).setAttribute('aria-current', 'step');
    updateAction();
    if (details) requestAnimationFrame(() => (($('#fName').value ? $('#fPhone').value ? $('#fAddress') : $('#fPhone') : $('#fName'))).focus());
  }

  $('#cartBack').addEventListener('click', () => setStep('items'));
  $('#cartAction').addEventListener('click', () => step === 'items' ? setStep('details') : placeOrder());
  $('#viewDetails').addEventListener('submit', e => { e.preventDefault(); placeOrder(); });

  $$('input[name="type"]').forEach(r => r.addEventListener('change', () => {
    $('#addressField').hidden = r.value === 'pickup' && r.checked;
    renderCart();
  }));

  // ---------- Mobile sheet
  let lastFocus = null;
  function openCart() {
    if (window.innerWidth > 1000) { $('#cart').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); return; }
    lastFocus = document.activeElement;
    $('#cart').classList.add('open'); $('#cartScrim').hidden = false;
    $('#cart').setAttribute('role', 'dialog'); $('#cart').setAttribute('aria-modal', 'true');
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => $('#cartClose').focus());
  }
  function closeCart() {
    $('#cart').classList.remove('open'); $('#cartScrim').hidden = true;
    $('#cart').removeAttribute('role'); $('#cart').removeAttribute('aria-modal');
    document.body.style.overflow = '';
    lastFocus?.focus?.();
  }
  $('#cartBar').addEventListener('click', openCart);
  $('#cartClose').addEventListener('click', closeCart);
  $('#cartScrim').addEventListener('click', closeCart);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#cart').classList.contains('open')) closeCart(); });

  // ---------- Details form
  function prefillDetails() {
    const saved = store.get('bk-details', null);
    if (!saved) return;
    $('#fName').value = saved.customer_name || '';
    $('#fPhone').value = saved.phone || '';
    $('#fAddress').value = saved.address || '';
    if (saved.type === 'pickup') { $('#typePickup').checked = true; $('#addressField').hidden = true; }
  }

  const PHONE_RE = /^(?:\+92|0092|0)?3\d{9}$/;
  function validate(v) {
    const errors = {};
    if (v.customer_name.trim().length < 2) errors.customer_name = 'Enter the name we should ask for.';
    if (!PHONE_RE.test(v.phone.replace(/[\s-()]/g, ''))) errors.phone = 'Enter a mobile number like 0345 8081990.';
    if (v.type === 'delivery' && v.address.trim().length < 8) errors.address = 'Enter a full delivery address, including area and street.';
    return errors;
  }
  function showErrors(errors) {
    $$('#viewDetails .field[data-field]').forEach(f => {
      const msg = errors[f.dataset.field];
      f.classList.toggle('invalid', !!msg);
      const input = f.querySelector('input, textarea');
      input?.setAttribute('aria-invalid', msg ? 'true' : 'false');
      const errEl = f.querySelector('.error');
      if (errEl) { errEl.textContent = msg || ''; errEl.id ||= `err-${f.dataset.field}`; }
      if (input && msg) input.setAttribute('aria-errormessage', errEl.id);
    });
    const first = Object.keys(errors)[0];
    if (first) $(`#viewDetails [data-field="${first}"] input, #viewDetails [data-field="${first}"] textarea`)?.focus();
  }
  // Clear an error as soon as the person fixes it
  $('#viewDetails').addEventListener('input', e => {
    const f = e.target.closest('.field.invalid');
    if (!f) return;
    const errs = validate(formValues());
    if (!errs[f.dataset.field]) { f.classList.remove('invalid'); e.target.setAttribute('aria-invalid', 'false'); }
  });

  function formValues() {
    return {
      type: $('input[name="type"]:checked').value,
      customer_name: $('#fName').value, phone: $('#fPhone').value,
      address: $('#fAddress').value, notes: $('#fNotes').value,
    };
  }

  let placing = false;
  async function placeOrder() {
    if (placing) return;
    const v = formValues();
    const errors = validate(v);
    $('#formError').hidden = true;
    showErrors(errors);
    if (Object.keys(errors).length) return;
    placing = true;
    const btn = $('#cartAction');
    btn.disabled = true; btn.innerHTML = '<span class="spinner" aria-hidden="true"></span> Placing your order…';
    try {
      const { order } = await api('/api/orders', { method: 'POST', body: { ...v, lines: cart } });
      if ($('#fRemember').checked) store.set('bk-details', { customer_name: v.customer_name, phone: v.phone, address: v.address, type: v.type });
      else store.del('bk-details');
      store.set('bk-orders', [{ code: order.code, number: order.number, at: Date.now() }, ...store.get('bk-orders', [])].slice(0, 10));
      store.set('bk-cart', []);
      location.href = `/track/${encodeURIComponent(order.code)}?new=1`;
    } catch (e) {
      placing = false;
      if (e.fields) showErrors(e.fields);
      $('#formError').textContent = e.message; $('#formError').hidden = false;
      updateAction();
    }
  }

  // ---------- Highlight the section in view
  function setupScrollSpy() {
    const links = $$('#cats a');
    const obs = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        links.forEach(a => a.setAttribute('aria-current', a.getAttribute('href') === `#${en.target.id}` ? 'true' : 'false'));
      });
    }, { rootMargin: '-30% 0px -60% 0px' });
    $$('.menu-section').forEach(s => obs.observe(s));
  }

  load();
})();
