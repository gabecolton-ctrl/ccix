// product.js — product page: options, live price, stock, add to cart.
(function () {
  var root = document.getElementById('pdp');
  if (!root) return;
  var p = Store.product(root.getAttribute('data-slug'));
  var sel = Store.defaultSel(p);
  var stock = {};
  var esc = Store.esc;

  var artEl = root.querySelector('.pdp-art');
  var priceEl = root.querySelector('.pdp-price');
  var optsEl = root.querySelector('.pdp-options');
  var stockEl = root.querySelector('.stock-note');
  var addBtn = root.querySelector('[data-add]');
  var qtyIn = root.querySelector('.qty input');
  var calloutEl = root.querySelector('.pro-callout');

  // Pre-select from ?shade=…&length=… when linked from elsewhere.
  var params = new URLSearchParams(location.search);
  (p.options || []).forEach(function (o) {
    var v = params.get(o.name.toLowerCase());
    if (v && Store.optionValues(o).indexOf(v) !== -1) sel[o.name] = v;
  });

  function drawArt() {
    var badge = p.proOnly ? '<span class="badge pro">Pro</span>' : '';
    artEl.innerHTML = badge + Store.art(p, sel).replace('xMidYMid slice', 'xMidYMid meet');
    Store.photoize(artEl, p.slug);
  }
  function drawOptions() {
    optsEl.innerHTML = (p.options || []).map(function (o) {
      var vals = Store.optionValues(o);
      var cur = sel[o.name];
      var shown = o.shades ? '#' + cur + ' ' + Store.shade(cur).name : cur;
      var buttons = vals.map(function (v) {
        if (o.shades) {
          var s = Store.shade(v);
          var bg = s.hex2 ? 'linear-gradient(135deg,' + s.hex + ' 50%,' + s.hex2 + ' 50%)' : s.hex;
          return '<button type="button" class="shade" style="background:' + bg + '" data-opt="' + esc(o.name) + '" data-val="' + esc(v) + '" aria-pressed="' + (v === cur) + '" aria-label="#' + esc(v) + ' ' + esc(s.name) + '" title="#' + esc(v) + ' ' + esc(s.name) + '"></button>';
        }
        return '<button type="button" data-opt="' + esc(o.name) + '" data-val="' + esc(v) + '" aria-pressed="' + (v === cur) + '">' + esc(v) + '</button>';
      }).join('');
      return '<div class="opt"><div class="opt-label">' + esc(o.name) + ' <span>' + esc(shown) + '</span></div><div class="opt-values" role="group" aria-label="' + esc(o.name) + '">' + buttons + '</div></div>';
    }).join('');
  }
  function drawPrice() {
    var t = Store.tier();
    var retail = Store.priceOf(p, sel, 'retail'), pro = Store.priceOf(p, sel, 'pro');
    var signedIn = !!Backend.user();
    var html;
    if (t === 'pro') {
      html = '<div class="main" style="color:var(--oxblood)">' + Store.money(pro) + '</div><div class="sub">Pro price · retail ' + Store.money(retail) + '</div>';
    } else {
      html = '<div class="main">' + Store.money(retail) + '</div>' +
        '<div class="sub">Salon professional? <a href="' + Store.url('pro/') + '">Apply for wholesale pricing</a></div>';
    }
    priceEl.innerHTML = html;

    var canBuy = !p.proOnly || t === 'pro';
    addBtn.disabled = false;
    if (!canBuy) {
      addBtn.textContent = signedIn ? 'Pro accounts only' : 'Pro accounts only';
      addBtn.disabled = true;
      var pending = Store.profile() && Store.profile().pro && Store.profile().pro.status === 'pending';
      calloutEl.hidden = false;
      calloutEl.innerHTML = pending
        ? '<strong>Your pro application is under review.</strong> You\'ll be able to order this as soon as you\'re approved.'
        : '<strong>Professional product.</strong> Sold to licensed stylists and salons. <a href="' + Store.url('pro/') + '">Apply for a pro account</a> — it takes two minutes.';
    } else {
      calloutEl.hidden = true;
      var q = stock[Store.sku(p, sel)];
      if (typeof q === 'number' && q <= 0) { addBtn.textContent = 'Sold out'; addBtn.disabled = true; }
      else addBtn.textContent = 'Add to bag';
    }
    var k = Store.sku(p, sel), qty = stock[k];
    stockEl.className = 'stock-note';
    if (typeof qty !== 'number') stockEl.textContent = 'In stock · ships in 1–2 business days';
    else if (qty <= 0) { stockEl.textContent = 'Sold out in this option'; stockEl.classList.add('out'); }
    else if (qty <= 5) { stockEl.textContent = 'Only ' + qty + ' left'; stockEl.classList.add('low'); }
    else stockEl.textContent = 'In stock · ships in 1–2 business days';
  }
  function syncUrl() {
    var q = (p.options || []).map(function (o) { return o.name.toLowerCase() + '=' + encodeURIComponent(sel[o.name]); }).join('&');
    if (q) history.replaceState(null, '', location.pathname + '?' + q);
  }

  optsEl.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-opt]'); if (!b) return;
    sel[b.getAttribute('data-opt')] = b.getAttribute('data-val');
    drawOptions(); drawPrice(); syncUrl();
    if ((p.options || []).some(function (o) { return o.name === b.getAttribute('data-opt') && (o.shades || p.art === 'beads'); })) drawArt();
  });
  root.querySelector('.qty').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var v = Math.max(1, Math.min(99, (parseInt(qtyIn.value, 10) || 1) + (b.getAttribute('data-d') === '+' ? 1 : -1)));
    qtyIn.value = v;
  });
  addBtn.addEventListener('click', function () {
    var qty = Math.max(1, Math.min(99, parseInt(qtyIn.value, 10) || 1));
    Store.cart.add(p.slug, Object.assign({}, sel), qty);
    Store.toast('<span class="t-msg"><b>Added to bag</b><br>' + esc(p.name) + (Store.variantLabel(p, sel) ? ' · ' + esc(Store.variantLabel(p, sel)) : '') + (qty > 1 ? ' × ' + qty : '') + '</span><a href="' + Store.url('cart/') + '">View bag</a>');
  });

  drawArt(); drawOptions(); drawPrice();
  document.addEventListener('ccix:account', drawPrice);
  Backend.getStock().then(function (s) { stock = s || {}; drawPrice(); }).catch(function () {});
})();
