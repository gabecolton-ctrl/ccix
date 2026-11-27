// admin.js — Orders, Pros, Stock and Settings pages (admin accounts only).
(function () {
  var main = document.getElementById('admin');
  if (!main) return;
  var page = main.getAttribute('data-admin');
  var body = document.getElementById('admin-body');
  var esc = Store.esc;
  var PAYL = { invoice: 'Card — send invoice', zelle: 'Zelle', venmo: 'Venmo', cashapp: 'Cash App' };

  Store.onReady(function (user) {
    if (!user) { location.href = Store.url('login/?stay=1'); return; }
    if (!Backend.isAdmin()) { body.innerHTML = '<div class="notice err">This page is for store admins only.</div>'; return; }
    ({ orders: orders, pros: pros, stock: stock, settings: settings })[page]();
  });

  // ------------------------------------------------------------ orders
  function priceCheck(o) {
    // Recompute every line from the catalog at the order's pricing tier.
    var bad = [];
    o.items.forEach(function (i) {
      var p = Store.product(i.slug);
      var expect = p ? Store.priceOf(p, skuSel(p, i.sku), o.pricing) : null;
      if (expect == null || Math.abs(expect - i.unit) > 0.009) bad.push(i.name + ' (charged ' + Store.money(i.unit) + ', catalog ' + (expect == null ? '?' : Store.money(expect)) + ')');
    });
    return bad;
  }
  function skuSel(p, sku) {
    var parts = sku.split('--').slice(1), sel = {};
    (p.options || []).forEach(function (o, idx) {
      var vals = Store.optionValues(o);
      sel[o.name] = vals.filter(function (v) { return v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') === parts[idx]; })[0];
    });
    return sel;
  }
  function orders() {
    var filter = 'open', all = [];
    body.innerHTML = '<div class="filters" id="ofilters">' + ['open', 'pending', 'paid', 'shipped', 'cancelled', 'all'].map(function (f) {
      return '<button class="chip" data-f="' + f + '">' + f[0].toUpperCase() + f.slice(1) + '</button>';
    }).join('') + '</div><div id="olist" class="loading">Loading orders…</div>';
    var listEl = document.getElementById('olist');
    function draw() {
      document.querySelectorAll('#ofilters .chip').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-f') === filter); });
      var list = all.filter(function (o) { return filter === 'all' || (filter === 'open' ? (o.status === 'pending' || o.status === 'paid') : o.status === filter); });
      listEl.className = '';
      if (!list.length) { listEl.innerHTML = '<p class="muted">No ' + filter + ' orders.</p>'; return; }
      listEl.innerHTML = list.map(function (o) {
        var bad = priceCheck(o);
        var items = o.items.map(function (i) { return '<div class="sum-row small"><span>' + i.qty + ' × ' + esc(i.name) + (i.label ? ' <span class="muted">· ' + esc(i.label) + '</span>' : '') + ' <span class="muted">@ ' + Store.money(i.unit) + '</span></span><span class="num">' + Store.money(i.line) + '</span></div>'; }).join('');
        var s = o.shipTo || {};
        return '<div class="order-card" data-id="' + esc(o.id) + '">' +
          '<div class="order-top"><div><b>' + esc(o.number) + '</b> <span class="status ' + esc(o.status) + '">' + esc(o.status) + '</span>' + (o.pricing === 'pro' ? ' <span class="pro-pill">PRO</span>' : '') + '</div><b class="num">' + Store.money(o.total) + '</b></div>' +
          '<div class="small muted">' + new Date(o.createdAt).toLocaleString() + ' · ' + esc(PAYL[o.payment] || o.payment) + '</div>' +
          '<div class="small"><b>' + esc(o.name) + '</b> · <a href="mailto:' + esc(o.email) + '">' + esc(o.email) + '</a> · <a href="tel:' + esc(o.phone) + '">' + esc(o.phone) + '</a></div>' +
          '<div class="small muted">' + esc([s.line1, s.line2, s.city + ', ' + s.state + ' ' + s.zip].filter(Boolean).join(', ')) + '</div>' +
          items +
          '<div class="small muted">Subtotal ' + Store.money(o.subtotal) + ' · Shipping ' + Store.money(o.shipping) + ' · Tax ' + Store.money(o.tax) + '</div>' +
          (o.notes ? '<div class="small">Note: ' + esc(o.notes) + '</div>' : '') +
          (bad.length ? '<div class="notice err small"><b>Price check failed:</b> ' + esc(bad.join('; ')) + '. Confirm the total before invoicing.</div>' : '<div class="small" style="color:var(--ok)">✓ Prices match the catalog</div>') +
          '<div class="order-actions"><select aria-label="Status">' + ['pending', 'paid', 'shipped', 'cancelled'].map(function (st) { return '<option' + (st === o.status ? ' selected' : '') + '>' + st + '</option>'; }).join('') + '</select>' +
          '<input placeholder="Tracking #" value="' + esc(o.tracking || '') + '" aria-label="Tracking number">' +
          '<button class="btn btn-dark" data-save>Save</button></div></div>';
      }).join('');
    }
    function load() {
      Backend.allOrders().then(function (list) {
        all = list.sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); }); draw();
      }).catch(function (e) { listEl.innerHTML = '<div class="notice err">Couldn\'t load orders: ' + esc(e.message) + '</div>'; });
    }
    document.getElementById('ofilters').addEventListener('click', function (e) { var b = e.target.closest('.chip'); if (b) { filter = b.getAttribute('data-f'); draw(); } });
    listEl.addEventListener('click', function (e) {
      var b = e.target.closest('[data-save]'); if (!b) return;
      var card = b.closest('.order-card'), id = card.getAttribute('data-id');
      var o = all.filter(function (x) { return x.id === id; })[0];
      var status = card.querySelector('select').value, tracking = card.querySelector('input').value.trim();
      var upd = { status: status, tracking: tracking, updatedAt: Backend.now() };
      // Stock comes out when an order is marked paid or shipped, and goes back if cancelled.
      var change = {}, sign = 0;
      if ((status === 'paid' || status === 'shipped') && !o.stockTaken) { sign = -1; upd.stockTaken = true; }
      if (status === 'cancelled' && o.stockTaken) { sign = 1; upd.stockTaken = false; }
      if (sign) o.items.forEach(function (i) { change[i.sku] = (change[i.sku] || 0) + sign * i.qty; });
      b.disabled = true;
      (sign ? Backend.adjustStock(change) : Promise.resolve()).then(function () { return Backend.updateOrder(id, upd); }).then(function () {
        Object.assign(o, upd); Store.toast('Order ' + esc(o.number) + ' saved'); draw();
        if (status === 'shipped' && tracking) Store.notify('CCIX order ' + o.number + ' shipped', { Customer: o.email, Tracking: tracking, Reminder: 'Let the customer know their tracking number.' });
      }).catch(function (err) { b.disabled = false; Store.toast('Save failed: ' + esc(err.message)); });
    });
    load();
  }

  // ------------------------------------------------------------ pros
  function pros() {
    body.innerHTML = '<div id="plist" class="loading">Loading…</div>';
    var el = document.getElementById('plist'), users = [];
    function draw() {
      var list = users.filter(function (u) { return u.pro; });
      var order = { pending: 0, approved: 1, denied: 2 };
      list.sort(function (a, b) { return (order[a.pro.status] - order[b.pro.status]) || String(b.pro.appliedAt).localeCompare(String(a.pro.appliedAt)); });
      el.className = '';
      if (!list.length) { el.innerHTML = '<p class="muted">No pro applications yet.</p>'; return; }
      el.innerHTML = list.map(function (u) {
        var p = u.pro;
        var ig = p.instagram ? '<a href="https://instagram.com/' + esc(p.instagram.replace(/^@/, '')) + '" target="_blank" rel="noopener">' + esc(p.instagram) + '</a>' : '—';
        var web = p.website ? '<a href="' + (/^https?:/.test(p.website) ? '' : 'https://') + esc(p.website) + '" target="_blank" rel="noopener">' + esc(p.website) + '</a>' : '—';
        return '<div class="order-card" data-uid="' + esc(u.uid) + '"><div class="order-top"><b>' + esc(p.salon) + '</b><span class="status ' + esc(p.status) + '">' + esc(p.status) + '</span></div>' +
          '<div class="small">' + esc(u.name || '') + ' · ' + esc(u.email || '') + (u.phone ? ' · ' + esc(u.phone) : '') + '</div>' +
          '<div class="small muted">' + esc(p.role || 'Stylist') + ' · ' + esc(p.city) + ' · License <b>' + esc(p.license) + '</b> · Resale cert ' + esc(p.resaleCert || '—') + '</div>' +
          '<div class="small">Instagram ' + ig + ' · Website ' + web + '</div>' +
          '<div class="small muted">Applied ' + (p.appliedAt ? new Date(p.appliedAt).toLocaleDateString() : '—') + '</div>' +
          '<div class="order-actions"><label class="small" style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-exempt' + (p.taxExempt ? ' checked' : '') + '> Tax exempt (resale cert verified)</label>' +
          (p.status !== 'approved' ? '<button class="btn btn-accent" data-set="approved">Approve</button>' : '<button class="btn btn-line" data-set="approved">Update</button>') +
          (p.status !== 'denied' ? '<button class="btn btn-line" data-set="denied">' + (p.status === 'approved' ? 'Revoke' : 'Deny') + '</button>' : '') + '</div></div>';
      }).join('');
    }
    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-set]'); if (!b) return;
      var card = b.closest('.order-card'), uid = card.getAttribute('data-uid');
      var u = users.filter(function (x) { return x.uid === uid; })[0];
      var pro = Object.assign({}, u.pro, { status: b.getAttribute('data-set'), taxExempt: card.querySelector('[data-exempt]').checked, decidedAt: Backend.now() });
      Backend.saveProfile(uid, { pro: pro }).then(function () {
        u.pro = pro; draw(); Store.toast(esc(pro.salon) + ': ' + pro.status);
      }).catch(function (err) { Store.toast('Failed: ' + esc(err.message)); });
    });
    Backend.listUsers().then(function (list) { users = list; draw(); }).catch(function (e) { el.innerHTML = '<div class="notice err">' + esc(e.message) + '</div>'; });
  }

  // ------------------------------------------------------------ stock
  function stock() {
    body.innerHTML = '<p class="muted" style="margin-bottom:18px">Leave a box empty to not track that option (it always shows in stock). Enter 0 to mark it sold out. Stock comes out automatically when you mark an order paid or shipped.</p><div class="filters" id="sfilters"></div><div class="table-wrap"><table><thead><tr><th>Product</th><th>Option</th><th class="r">On hand</th></tr></thead><tbody id="sbody"><tr><td colspan="3" class="muted">Loading…</td></tr></tbody></table></div>';
    var cat = 'extensions', counts = {};
    var fEl = document.getElementById('sfilters');
    fEl.innerHTML = Store.C.categories.map(function (c) { return '<button class="chip" data-cat="' + c.id + '">' + esc(c.name) + '</button>'; }).join('');
    function draw() {
      fEl.querySelectorAll('.chip').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-cat') === cat); });
      document.getElementById('sbody').innerHTML = Store.C.products.filter(function (p) { return p.category === cat; }).map(function (p) {
        return Store.allSkus(p).map(function (v, i) {
          var q = counts[v.sku];
          return '<tr><td>' + (i === 0 ? '<b>' + esc(p.name) + '</b>' : '') + '</td><td>' + esc(v.label || 'Standard') + '</td><td class="r"><input class="stock-input" inputmode="numeric" data-sku="' + esc(v.sku) + '" value="' + (typeof q === 'number' ? q : '') + '" aria-label="Stock for ' + esc(p.name + ' ' + v.label) + '"></td></tr>';
        }).join('');
      }).join('');
    }
    fEl.addEventListener('click', function (e) { var b = e.target.closest('.chip'); if (b) { cat = b.getAttribute('data-cat'); draw(); } });
    document.getElementById('sbody').addEventListener('change', function (e) {
      var inp = e.target.closest('.stock-input'); if (!inp) return;
      var raw = inp.value.trim(), sku = inp.getAttribute('data-sku');
      var qty = raw === '' ? null : Math.max(0, parseInt(raw, 10) || 0);
      Backend.setStock(sku, qty).then(function () {
        if (qty === null) delete counts[sku]; else counts[sku] = qty;
        inp.style.borderColor = 'var(--ok)'; setTimeout(function () { inp.style.borderColor = ''; }, 900);
      }).catch(function (err) { Store.toast('Failed: ' + esc(err.message)); });
    });
    Backend.getStock().then(function (s) { counts = s || {}; draw(); });
  }

  // ------------------------------------------------------------ settings
  function settings() {
    Backend.getSettings().then(function (s) {
      body.innerHTML = '<form class="form panel" id="sform" style="max-width:720px">' +
        '<fieldset><legend>Shipping</legend><div class="row2">' +
        field('shippingFlat', 'Retail shipping ($)', s) + field('freeShipOver', 'Retail free shipping at ($)', s) +
        field('proShippingFlat', 'Pro shipping ($)', s) + field('proFreeShipOver', 'Pro free shipping at ($)', s) + '</div></fieldset>' +
        '<fieldset><legend>Tax</legend>' + field('taxRate', 'Sales tax on retail orders (%)', s) +
        '<p class="small muted">Pros marked tax exempt (resale certificate verified) aren\'t charged tax.</p></fieldset>' +
        '<fieldset><legend>Payment handles</legend><p class="small muted">A method only appears at checkout once it has a handle. Card payments are always offered as an emailed invoice.</p>' +
        textField('zelle', 'Zelle (email or phone)', s) + textField('venmo', 'Venmo (@handle)', s) + textField('cashapp', 'Cash App ($cashtag)', s) + '</fieldset>' +
        '<button class="btn btn-dark" type="submit">Save settings</button></form>';
      document.getElementById('sform').addEventListener('submit', function (e) {
        e.preventDefault();
        var f = e.target, data = {};
        ['shippingFlat', 'freeShipOver', 'proShippingFlat', 'proFreeShipOver', 'taxRate'].forEach(function (k) { data[k] = Number(f[k].value) || 0; });
        ['zelle', 'venmo', 'cashapp'].forEach(function (k) { data[k] = f[k].value.trim(); });
        Backend.saveSettings(data).then(function () { Store.toast('Settings saved'); }).catch(function (err) { Store.toast('Failed: ' + esc(err.message)); });
      });
    });
    function field(k, label, s) { return '<label>' + label + '<input name="' + k + '" inputmode="decimal" value="' + esc(s[k]) + '"></label>'; }
    function textField(k, label, s) { return '<label>' + label + '<input name="' + k + '" value="' + esc(s[k] || '') + '"></label>'; }
  }
})();
