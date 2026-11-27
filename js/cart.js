// cart.js — the bag page.
(function () {
  var listEl = document.getElementById('cart-lines');
  var sumEl = document.getElementById('cart-summary');
  if (!listEl) return;
  var esc = Store.esc, settings = null;

  function lineHtml(l, editable) {
    var p = l.product;
    var warn = p.proOnly && Store.tier() !== 'pro' ? '<div class="small" style="color:var(--err)">Pro accounts only — remove to check out</div>' : '';
    var qty = editable
      ? '<div class="qty" data-sku="' + esc(l.sku) + '"><button type="button" data-d="-" aria-label="Fewer">−</button><input type="number" min="0" max="99" value="' + l.qty + '" aria-label="Quantity"><button type="button" data-d="+" aria-label="More">+</button></div>'
      : '<span class="small muted">Qty ' + l.qty + '</span>';
    return '<div class="line"><a class="art" href="' + Store.url('products/' + p.slug + '/') + '" data-photo="' + p.slug + '">' + Store.art(p, l.sel) + '</a>' +
      '<div><h3><a href="' + Store.url('products/' + p.slug + '/') + '" style="color:inherit;text-decoration:none">' + esc(p.name) + '</a></h3>' +
      '<div class="meta">' + esc(l.label || p.unit) + '</div><div class="meta">' + Store.money(l.unit) + ' each</div>' + warn +
      (editable ? '<button class="linkish small" data-remove="' + esc(l.sku) + '" style="margin-top:8px">Remove</button>' : '') + '</div>' +
      '<div class="right"><span class="num" style="font-weight:600">' + Store.money(l.line) + '</span>' + qty + '</div></div>';
  }

  function render() {
    var t = Store.totals(settings, null, Store.profile());
    if (!t.lines.length) {
      listEl.innerHTML = '<div class="empty"><h2>Your bag is empty</h2><p class="muted" style="margin-top:8px">Find your shade and method in the shop.</p><div class="btn-row" style="justify-content:center"><a class="btn btn-dark" href="' + Store.url('shop/') + '">Shop now</a></div></div>';
      sumEl.hidden = true;
      return;
    }
    sumEl.hidden = false;
    listEl.innerHTML = t.lines.map(function (l) { return lineHtml(l, true); }).join('');
    Store.hydrateCards(listEl);
    var shipNote = t.shipping === 0 ? 'Free' : Store.money(t.shipping);
    var away = t.freeOver && t.subtotal < t.freeOver ? '<div class="notice small">Add <b>' + Store.money(t.freeOver - t.subtotal) + '</b> for free shipping.</div>' : '';
    var proNote = t.tier === 'pro'
      ? '<div class="notice ok small"><b>Pro pricing applied.</b></div>'
      : '<div class="small muted">Salon pro? <a href="' + Store.url('pro/') + '">Apply for wholesale pricing</a>.</div>';
    var block = t.blocked.length ? '<div class="notice err small">Your bag has pro-only items. Remove them, or <a href="' + Store.url('pro/') + '">apply for a pro account</a>.</div>' : '';
    sumEl.innerHTML = '<h2>Summary</h2>' + proNote +
      '<div class="sum-row"><span>Subtotal</span><span class="num">' + Store.money(t.subtotal) + '</span></div>' +
      '<div class="sum-row"><span>Shipping</span><span class="num">' + shipNote + '</span></div>' +
      '<div class="sum-row"><span>Estimated tax' + (t.taxExempt ? ' (exempt)' : '') + '</span><span class="num">' + Store.money(t.tax) + '</span></div>' +
      '<div class="sum-row total"><span>Total</span><span class="num">' + Store.money(t.total) + '</span></div>' + away + block +
      '<a class="btn btn-dark btn-block" href="' + Store.url('checkout/') + '"' + (t.blocked.length ? ' aria-disabled="true" style="pointer-events:none;opacity:.5"' : '') + '>Checkout</a>' +
      '<a class="small center" style="text-align:center" href="' + Store.url('shop/') + '">Continue shopping</a>';
  }

  listEl.addEventListener('click', function (e) {
    var r = e.target.closest('[data-remove]');
    if (r) { Store.cart.setQty(r.getAttribute('data-remove'), 0); return render(); }
    var b = e.target.closest('.qty button'); if (!b) return;
    var box = b.closest('.qty'), input = box.querySelector('input');
    var v = (parseInt(input.value, 10) || 0) + (b.getAttribute('data-d') === '+' ? 1 : -1);
    Store.cart.setQty(box.getAttribute('data-sku'), v); render();
  });
  listEl.addEventListener('change', function (e) {
    if (!e.target.matches('.qty input')) return;
    Store.cart.setQty(e.target.closest('.qty').getAttribute('data-sku'), parseInt(e.target.value, 10) || 0); render();
  });

  render();
  Backend.getSettings().then(function (s) { settings = s; render(); });
  document.addEventListener('ccix:account', render);
  window.CartView = { lineHtml: lineHtml };
})();
