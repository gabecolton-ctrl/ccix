// account.js — profile, pro status / application, order history.
(function () {
  var main = document.getElementById('account');
  if (!main) return;
  var esc = Store.esc;
  var PAYL = { invoice: 'Card (invoice)', zelle: 'Zelle', venmo: 'Venmo', cashapp: 'Cash App' };

  function proPanel(profile) {
    var pro = profile && profile.pro;
    var el = document.getElementById('pro-status');
    if (pro && pro.status === 'approved') {
      el.innerHTML = '<h2>Pro account <span class="status approved">Approved</span></h2><p class="muted" style="margin-top:8px">' + esc(pro.salon) + ' · Wholesale pricing is applied across the store' + (pro.taxExempt ? ' · Tax exempt (resale certificate on file)' : '') + '.</p><div class="btn-row"><a class="btn btn-dark" href="' + Store.url('shop/') + '">Shop at pro prices</a></div>';
    } else if (pro && pro.status === 'pending') {
      el.innerHTML = '<h2>Pro account <span class="status pending">Under review</span></h2><p class="muted" style="margin-top:8px">Thanks for applying, ' + esc(pro.salon) + '. We review applications within 1–2 business days and you\'ll see pro pricing as soon as you\'re approved. Meanwhile you can shop at retail.</p>';
    } else {
      var denied = pro && pro.status === 'denied' ? '<div class="notice warn small" style="margin-bottom:16px">Your previous application wasn\'t approved. You\'re welcome to apply again with updated details.</div>' : '';
      el.innerHTML = '<h2>Salon professional?</h2><p class="muted" style="margin:8px 0 18px">Licensed stylists and salons get wholesale pricing and access to pro-only products.</p>' + denied +
        '<form class="form" id="pro-form" novalidate>' + document.getElementById('pro-fields-tpl').innerHTML +
        '<div class="form-msg notice err" hidden></div><button class="btn btn-accent" type="submit">Submit application</button></form>';
      var f = document.getElementById('pro-form');
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var app = ProApply.read(f), miss = ProApply.missing(app), m = f.querySelector('.form-msg');
        if (miss) { m.hidden = false; m.textContent = 'Please fill in your salon, license number and city.'; f.elements[miss].focus(); return; }
        var user = Backend.user();
        ProApply.submit(user, app, { name: (profile && profile.name) || '', phone: (profile && profile.phone) || '' }).then(function (data) {
          var p = Object.assign({}, profile || {}, data); Store.setProfile(p); proPanel(p);
        }).catch(function (err) { m.hidden = false; m.textContent = err.message; });
      });
    }
  }

  function details(user, profile) {
    var f = document.getElementById('details-form');
    var a = (profile && profile.address) || {};
    f.name.value = (profile && profile.name) || ''; f.phone.value = (profile && profile.phone) || '';
    f.line1.value = a.line1 || ''; f.line2.value = a.line2 || ''; f.city.value = a.city || ''; f.state.value = a.state || ''; f.zip.value = a.zip || '';
    document.getElementById('acct-email').textContent = user.email;
    f.onsubmit = function (e) {
      e.preventDefault();
      var data = { name: f.name.value.trim(), phone: f.phone.value.trim(), address: { line1: f.line1.value.trim(), line2: f.line2.value.trim(), city: f.city.value.trim(), state: f.state.value.trim().toUpperCase(), zip: f.zip.value.trim() } };
      Backend.saveProfile(user.uid, data).then(function () { Store.setProfile(Object.assign({}, profile, data)); Store.toast('Details saved'); })
        .catch(function (err) { Store.toast(esc(err.message)); });
    };
  }

  function orders(user) {
    var el = document.getElementById('orders-list');
    Backend.myOrders(user.uid).then(function (list) {
      list.sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
      if (!list.length) { el.innerHTML = '<p class="muted">No orders yet. <a href="' + Store.url('shop/') + '">Start shopping</a>.</p>'; return; }
      el.innerHTML = list.map(function (o) {
        var items = o.items.map(function (i) { return '<div class="sum-row small"><span>' + i.qty + ' × ' + esc(i.name) + (i.label ? ' <span class="muted">· ' + esc(i.label) + '</span>' : '') + '</span><span class="num">' + Store.money(i.line) + '</span></div>'; }).join('');
        var track = o.tracking ? '<div class="small">Tracking: <b>' + esc(o.tracking) + '</b></div>' : '';
        return '<div class="order-card"><div class="order-top"><b>' + esc(o.number) + '</b><span class="status ' + esc(o.status) + '">' + esc(o.status) + '</span></div>' +
          '<div class="small muted">' + new Date(o.createdAt).toLocaleDateString() + ' · ' + (PAYL[o.payment] || esc(o.payment)) + (o.pricing === 'pro' ? ' · Pro pricing' : '') + '</div>' +
          items + '<div class="sum-row"><b>Total</b><b class="num">' + Store.money(o.total) + '</b></div>' + track + '</div>';
      }).join('');
    }).catch(function () { el.innerHTML = '<p class="muted">Couldn\'t load your orders right now.</p>'; });
  }

  document.getElementById('signout').addEventListener('click', function () {
    Backend.signOut().then(function () { location.href = Store.url(''); });
  });

  Store.onReady(function (user, profile) {
    if (!user) { location.href = Store.url('login/'); return; }
    document.getElementById('account-loading').hidden = true;
    document.getElementById('account-body').hidden = false;
    var hello = document.getElementById('hello');
    hello.textContent = profile && profile.name ? 'Hi, ' + profile.name.split(' ')[0] : 'Your account';
    proPanel(profile); details(user, profile); orders(user);
    if (location.hash === '#pro') document.getElementById('pro-status').scrollIntoView();
  });
})();
