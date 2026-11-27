// checkout.js — shipping details, payment choice, place order.
(function () {
  var main = document.getElementById('checkout');
  if (!main) return;
  var esc = Store.esc, settings = null, placing = false;
  var formEl = document.getElementById('checkout-form');
  var sumEl = document.getElementById('checkout-summary');
  var gateEl = document.getElementById('checkout-gate');
  var doneEl = document.getElementById('checkout-done');

  var PAY = {
    invoice: { label: 'Credit or debit card', note: 'We email a secure card invoice within one business day. Your order ships once it\'s paid.' },
    zelle: { label: 'Zelle', note: '' },
    venmo: { label: 'Venmo', note: '' },
    cashapp: { label: 'Cash App', note: '' }
  };

  function payOptions() {
    return ['invoice', 'zelle', 'venmo', 'cashapp'].filter(function (m) { return m === 'invoice' || (settings && settings[m]); }).map(function (m, i) {
      var note = m === 'invoice' ? PAY[m].note : 'Send to <b>' + esc(settings[m]) + '</b> with your order number as the note. We ship once it arrives.';
      return '<label class="pay-opt"><input type="radio" name="payment" value="' + m + '"' + (i === 0 ? ' checked' : '') + '><span>' + PAY[m].label + '<small>' + note + '</small></span></label>';
    }).join('');
  }

  function summary() {
    var t = Store.totals(settings, null, Store.profile());
    sumEl.innerHTML = '<h2>Your order</h2>' + t.lines.map(function (l) {
      return '<div class="sum-row"><span>' + esc(l.name) + (l.label ? '<br><span class="small muted">' + esc(l.label) + '</span>' : '') + '<br><span class="small muted">Qty ' + l.qty + '</span></span><span class="num">' + Store.money(l.line) + '</span></div>';
    }).join('') +
      (t.tier === 'pro' ? '<div class="notice ok small"><b>Pro pricing applied.</b></div>' : '') +
      '<div class="sum-row" style="border-top:1px solid var(--line);padding-top:12px"><span>Subtotal</span><span class="num">' + Store.money(t.subtotal) + '</span></div>' +
      '<div class="sum-row"><span>Shipping</span><span class="num">' + (t.shipping ? Store.money(t.shipping) : 'Free') + '</span></div>' +
      '<div class="sum-row"><span>Tax' + (t.taxExempt ? ' (exempt)' : '') + '</span><span class="num">' + Store.money(t.tax) + '</span></div>' +
      '<div class="sum-row total"><span>Total</span><span class="num">' + Store.money(t.total) + '</span></div>';
    return t;
  }

  function orderNumber() {
    var d = new Date(), pad = function (n) { return (n < 10 ? '0' : '') + n; };
    var r = Math.random().toString(36).slice(2, 6).toUpperCase();
    return 'CX' + String(d.getFullYear()).slice(2) + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + r;
  }

  function show(user, profile) {
    if (!Store.cart.count()) { location.href = Store.url('cart/'); return; }
    if (!user) {
      gateEl.hidden = false; formEl.hidden = true; sumEl.hidden = false; summary();
      return;
    }
    gateEl.hidden = true; formEl.hidden = false;
    var t = summary();
    if (t.blocked.length) { location.href = Store.url('cart/'); return; }
    var a = (profile && profile.address) || {};
    var f = formEl;
    f.name.value = f.name.value || (profile && profile.name) || '';
    f.phone.value = f.phone.value || (profile && profile.phone) || '';
    f.line1.value = f.line1.value || a.line1 || '';
    f.line2.value = f.line2.value || a.line2 || '';
    f.city.value = f.city.value || a.city || '';
    f.state.value = f.state.value || a.state || 'TX';
    f.zip.value = f.zip.value || a.zip || '';
    document.getElementById('pay-options').innerHTML = payOptions();
    document.getElementById('checkout-email').textContent = user.email;
  }

  formEl.addEventListener('submit', function (e) {
    e.preventDefault();
    if (placing) return;
    var user = Backend.user(); if (!user) return;
    var f = formEl, err = document.getElementById('checkout-error');
    err.hidden = true;
    var need = ['name', 'phone', 'line1', 'city', 'state', 'zip'].filter(function (k) { return !f[k].value.trim(); });
    if (need.length) { err.hidden = false; err.textContent = 'Please fill in your name, phone and shipping address.'; f[need[0]].focus(); return; }
    var t = Store.totals(settings, null, Store.profile());
    if (!t.lines.length || t.blocked.length) return;
    placing = true;
    var btn = f.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Placing order…';
    var shipTo = { name: f.name.value.trim(), line1: f.line1.value.trim(), line2: f.line2.value.trim(), city: f.city.value.trim(), state: f.state.value.trim().toUpperCase(), zip: f.zip.value.trim() };
    var payment = (f.querySelector('input[name=payment]:checked') || {}).value || 'invoice';
    var number = orderNumber();
    var order = {
      number: number, userId: user.uid, email: user.email, name: shipTo.name, phone: f.phone.value.trim(),
      items: t.lines.map(function (l) { return { sku: l.sku, slug: l.slug, name: l.name, label: l.label, qty: l.qty, unit: l.unit, line: l.line }; }),
      pricing: t.tier, subtotal: t.subtotal, shipping: t.shipping, tax: t.tax, total: t.total,
      payment: payment, shipTo: shipTo, notes: f.notes.value.trim(), status: 'pending', tracking: '',
      createdAt: Backend.now(), updatedAt: Backend.now()
    };
    var saveProfile = f.save.checked ? Backend.saveProfile(user.uid, { name: shipTo.name, phone: order.phone, address: { line1: shipTo.line1, line2: shipTo.line2, city: shipTo.city, state: shipTo.state, zip: shipTo.zip } }) : Promise.resolve();
    saveProfile.catch(function () {}).then(function () { return Backend.placeOrder(order); }).then(function () {
      Store.notify('New CCIX order ' + number + ' — ' + Store.money(order.total), {
        Order: number, Customer: order.name + ' <' + order.email + '>', Phone: order.phone,
        Pricing: order.pricing === 'pro' ? 'PRO' : 'Retail', Payment: PAY[payment].label,
        Items: order.items.map(function (i) { return i.qty + ' × ' + i.name + (i.label ? ' (' + i.label + ')' : '') + ' @ ' + Store.money(i.unit); }).join('\n'),
        Total: Store.money(order.subtotal) + ' + ship ' + Store.money(order.shipping) + ' + tax ' + Store.money(order.tax) + ' = ' + Store.money(order.total),
        'Ship to': [shipTo.name, shipTo.line1, shipTo.line2, shipTo.city + ', ' + shipTo.state + ' ' + shipTo.zip].filter(Boolean).join('\n'),
        Notes: order.notes || '—'
      });
      Store.cart.clear();
      formEl.hidden = true; sumEl.hidden = true;
      var how = payment === 'invoice' ? PAY.invoice.note
        : 'Please send <b>' + Store.money(order.total) + '</b> by ' + PAY[payment].label + ' to <b>' + esc(settings[payment]) + '</b> with <b>' + number + '</b> as the note. We ship as soon as it arrives.';
      doneEl.hidden = false;
      doneEl.innerHTML = '<span class="kicker">Order placed</span><h1>Thank you.</h1><p class="lede" style="margin-top:12px">Your order number is <b>' + number + '</b>. A summary is saved in your account.</p>' +
        '<div class="notice" style="margin-top:22px;max-width:620px">' + how + '</div>' +
        '<div class="btn-row"><a class="btn btn-dark" href="' + Store.url('account/') + '#orders">View my orders</a><a class="btn btn-line" href="' + Store.url('shop/') + '">Keep shopping</a></div>';
      window.scrollTo(0, 0);
    }).catch(function (e2) {
      placing = false; btn.disabled = false; btn.textContent = 'Place order';
      err.hidden = false; err.textContent = 'We couldn\'t place your order. Please try again, or contact us. (' + (e2 && e2.message || 'error') + ')';
    });
  });

  Backend.getSettings().then(function (s) {
    settings = s;
    Store.onReady(show);
    document.addEventListener('ccix:account', function (e) { if (!placing) show(e.detail.user, e.detail.profile); });
  });
})();
