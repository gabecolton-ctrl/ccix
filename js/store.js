// store.js — catalog helpers, pricing, cart, pro status, header, product art.
// Needs: config.js, catalog.js (built from data/catalog.json), backend.js.

var Store = (function () {
  var C = window.CATALOG;
  var bySlug = {};
  C.products.forEach(function (p) { bySlug[p.slug] = p; });
  var shadeBy = {};
  C.shades.forEach(function (s) { shadeBy[s.code] = s; });

  // ------------------------------------------------------------ helpers
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) { return '$' + (Math.round(Number(n || 0) * 100) / 100).toFixed(2); }
  function money0(n) { var v = Math.round(Number(n || 0) * 100) / 100; return '$' + (v % 1 ? v.toFixed(2) : v.toFixed(0)); }
  function slugify(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
  function root() { var r = document.documentElement.getAttribute('data-root'); return r == null ? '/' : r; }
  // Links are relative to the page (data-root="../" etc.) so the site works on
  // any host. Preview builds set data-index to spell out index.html.
  function url(path) {
    path = String(path || '').replace(/^\//, '');
    if (document.documentElement.hasAttribute('data-index')) {
      var m = path.match(/^([^?#]*)(.*)$/);
      if (m[1] === '' || /\/$/.test(m[1])) path = m[1] + 'index.html' + m[2];
    }
    return root() + path;
  }

  // ------------------------------------------------------------ catalog
  function product(slug) { return bySlug[slug]; }
  function optionValues(opt) {
    return opt.shades ? C.shades.map(function (s) { return s.code; }) : opt.values;
  }
  function defaultSel(p) {
    var sel = {};
    (p.options || []).forEach(function (o) { sel[o.name] = optionValues(o)[0]; });
    return sel;
  }
  function sku(p, sel) {
    var parts = [p.slug];
    (p.options || []).forEach(function (o) { parts.push(slugify(sel[o.name])); });
    return parts.join('--');
  }
  function variantLabel(p, sel) {
    return (p.options || []).map(function (o) {
      var v = sel[o.name];
      if (o.shades) { var s = shadeBy[v]; return '#' + v + (s ? ' ' + s.name : ''); }
      return v;
    }).join(' · ');
  }
  function allSkus(p) {
    var combos = [{}];
    (p.options || []).forEach(function (o) {
      var next = [];
      combos.forEach(function (c) { optionValues(o).forEach(function (v) { var n = Object.assign({}, c); n[o.name] = v; next.push(n); }); });
      combos = next;
    });
    return combos.map(function (sel) { return { sku: sku(p, sel), sel: sel, label: variantLabel(p, sel) }; });
  }

  // ------------------------------------------------------------ pricing
  function priceOf(p, sel, tier) {
    var table = p[tier === 'pro' ? 'pro' : 'retail'];
    if (typeof table === 'number') return table;
    return table[(sel || defaultSel(p))[p.priceBy]];
  }
  function priceRange(p, tier) {
    var table = p[tier === 'pro' ? 'pro' : 'retail'];
    if (typeof table === 'number') return { min: table, max: table };
    var vals = Object.keys(table).map(function (k) { return table[k]; });
    return { min: Math.min.apply(null, vals), max: Math.max.apply(null, vals) };
  }
  function rangeText(p, tier) {
    var r = priceRange(p, tier);
    return r.min === r.max ? money0(r.min) : 'From ' + money0(r.min);
  }

  // ------------------------------------------------------------ account / tier
  var profile = null, profileLoaded = false, readyFns = [];
  function tier() { return profile && profile.pro && profile.pro.status === 'approved' ? 'pro' : 'retail'; }
  function onReady(fn) { if (profileLoaded) fn(Backend.user(), profile); else readyFns.push(fn); }
  Backend.onAuth(function (u) {
    var done = function () {
      profileLoaded = true;
      updateHeader();
      var fns = readyFns; readyFns = [];
      fns.forEach(function (fn) { fn(u, profile); });
      document.dispatchEvent(new CustomEvent('ccix:account', { detail: { user: u, profile: profile } }));
    };
    if (!u) { profile = null; return done(); }
    Backend.getProfile(u.uid).then(function (p) { profile = p || {}; done(); })
      .catch(function () { profile = {}; done(); });
  });
  function setProfile(p) { profile = p; updateHeader(); }

  // ------------------------------------------------------------ cart
  var CART_KEY = 'ccix_cart_v1';
  function cartRead() { try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch (e) { return []; } }
  function cartWrite(lines) {
    try { localStorage.setItem(CART_KEY, JSON.stringify(lines)); } catch (e) {}
    updateHeader();
  }
  function cartAdd(slug, sel, qty) {
    var p = product(slug); if (!p) return;
    var k = sku(p, sel), lines = cartRead(), found = false;
    lines.forEach(function (l) { if (l.sku === k) { l.qty = Math.min(99, l.qty + qty); found = true; } });
    if (!found) lines.push({ sku: k, slug: slug, sel: sel, qty: qty });
    cartWrite(lines);
  }
  function cartSetQty(k, qty) {
    var lines = cartRead().map(function (l) { if (l.sku === k) l.qty = Math.max(0, Math.min(99, qty)); return l; })
      .filter(function (l) { return l.qty > 0; });
    cartWrite(lines);
  }
  function cartClear() { cartWrite([]); }
  function cartCount() { return cartRead().reduce(function (n, l) { return n + l.qty; }, 0); }

  // Totals for the current cart. settings from Backend.getSettings().
  function totals(settings, t, prof) {
    t = t || tier();
    var lines = [], blocked = [], subtotal = 0;
    cartRead().forEach(function (l) {
      var p = product(l.slug); if (!p) return;
      var unit = priceOf(p, l.sel, t);
      if (unit == null) return;
      var row = { sku: l.sku, slug: l.slug, sel: l.sel, qty: l.qty, name: p.name, label: variantLabel(p, l.sel), unit: unit, line: Math.round(unit * l.qty * 100) / 100, product: p };
      if (p.proOnly && t !== 'pro') blocked.push(row);
      lines.push(row);
      subtotal += row.line;
    });
    subtotal = Math.round(subtotal * 100) / 100;
    var s = settings || CCIX_CONFIG.defaults;
    var flat = t === 'pro' ? Number(s.proShippingFlat) : Number(s.shippingFlat);
    var freeOver = t === 'pro' ? Number(s.proFreeShipOver) : Number(s.freeShipOver);
    var shipping = !lines.length ? 0 : (freeOver && subtotal >= freeOver ? 0 : flat);
    var exempt = t === 'pro' && prof && prof.pro && prof.pro.taxExempt;
    var tax = exempt ? 0 : Math.round(subtotal * (Number(s.taxRate) || 0)) / 100;
    var total = Math.round((subtotal + shipping + tax) * 100) / 100;
    return { tier: t, lines: lines, blocked: blocked, subtotal: subtotal, shipping: shipping, freeOver: freeOver, tax: tax, taxExempt: !!exempt, total: total };
  }

  // ------------------------------------------------------------ header
  function updateHeader() {
    var n = cartCount();
    document.querySelectorAll('.cart-count').forEach(function (el) { el.textContent = n || ''; el.setAttribute('data-n', n); });
    var u = Backend.user();
    document.querySelectorAll('[data-account-label]').forEach(function (el) { el.textContent = u ? 'Account' : 'Sign in'; });
    document.querySelectorAll('[data-account-link]').forEach(function (el) { el.href = url(u ? 'account/' : 'login/'); });
    document.querySelectorAll('[data-pro-pill]').forEach(function (el) { el.hidden = tier() !== 'pro'; });
    document.documentElement.classList.toggle('is-admin', Backend.isAdmin());
    document.documentElement.classList.toggle('is-pro', tier() === 'pro');
    document.documentElement.classList.toggle('signed-in', !!u);
  }

  function toast(html, ms) {
    var t = document.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.innerHTML = html; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove('show'); }, ms || 3600);
  }

  // ------------------------------------------------------------ product art
  // Drawn SVG until real photos exist. A photo at images/products/<slug>.jpg
  // replaces it automatically (see photoize()).
  function shadeHexes(code) {
    var s = shadeBy[code] || C.shades[4];
    return [s.hex, s.hex2 || lighten(s.hex, 0.28)];
  }
  function lighten(hex, amt) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    r = Math.round(r + (255 - r) * amt); g = Math.round(g + (255 - g) * amt); b = Math.round(b + (255 - b) * amt);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }
  var uid = 0;
  function art(p, sel) {
    var id = 'g' + (++uid);
    var tone = p.tone || '#e6d6c3';
    var bg = '<defs><linearGradient id="' + id + 'bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbf9f6"/><stop offset="1" stop-color="#efe7dd"/></linearGradient>';
    var body = '';
    if (p.art === 'hair') {
      var shade = (sel && sel.Shade) || '4/18';
      var h = shadeHexes(shade);
      bg += '<linearGradient id="' + id + 'h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + h[0] + '"/><stop offset=".55" stop-color="' + (h[1] === h[0] ? h[0] : mix(h[0], h[1])) + '"/><stop offset="1" stop-color="' + h[1] + '"/></linearGradient>';
      bg += '<linearGradient id="' + id + 'sh" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".22"/><stop offset=".45" stop-color="#fff" stop-opacity=".16"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></linearGradient></defs>';
      var strands = '';
      for (var i = 0; i < 26; i++) {
        var x = 120 + i * 6.2, amp = 10 + (i % 5) * 2.2, ph = (i % 7) * 0.6;
        var d = 'M' + x + ' 108';
        for (var y = 140; y <= 448; y += 32) {
          var dx = Math.sin(y / 46 + ph) * amp * (y / 448) + (x - 200) * (y - 108) / 900;
          d += ' S' + (x + dx - 4).toFixed(1) + ' ' + (y - 14) + ' ' + (x + dx).toFixed(1) + ' ' + y;
        }
        strands += '<path d="' + d + '" stroke="url(#' + id + 'h)" stroke-width="' + (7 + (i % 3)) + '" fill="none" stroke-linecap="round" opacity="' + (0.82 + (i % 4) * 0.05) + '"/>';
      }
      body = strands +
        '<path d="M112 96 h176 v24 h-176z" fill="#f4efe8" stroke="#d9cbbb"/>' +
        '<rect x="112" y="96" width="176" height="24" fill="url(#' + id + 'sh)" opacity=".5"/>' +
        '<text x="200" y="113" text-anchor="middle" font-family="Bodoni Moda, Georgia, serif" font-size="12" letter-spacing="3" fill="#6c1d2a">CCIX</text>' +
        '<path d="M120 120 C 180 130 220 130 280 120 L 290 470 C 230 480 170 480 110 470 Z" fill="url(#' + id + 'sh)" opacity=".35" style="mix-blend-mode:soft-light"/>';
    } else if (p.art === 'salon-bottle' || p.art === 'aerosol') {
      // CCIX Exclusive packaging: colored body, black square label.
      var bodyC = p.body || '#f4f1ec', capC = p.cap || '#f4f1ec';
      bg += '<linearGradient id="' + id + 'b" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="' + mixWith(bodyC, '#000', .16) + '"/><stop offset=".3" stop-color="' + lighten(bodyC, .45) + '"/><stop offset=".62" stop-color="' + bodyC + '"/><stop offset="1" stop-color="' + mixWith(bodyC, '#000', .22) + '"/></linearGradient>' +
        '<linearGradient id="' + id + 'c" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="' + mixWith(capC, '#000', .25) + '"/><stop offset=".35" stop-color="' + lighten(capC, p.capMetal || p.art === 'aerosol' ? .55 : .3) + '"/><stop offset=".7" stop-color="' + capC + '"/><stop offset="1" stop-color="' + mixWith(capC, '#000', .3) + '"/></linearGradient></defs>';
      var lines = p.label || [p.name.toUpperCase()];
      var lab = function (cx, y) {
        var s = '<rect x="' + (cx - 40) + '" y="' + y + '" width="80" height="80" fill="#111"/><rect x="' + (cx - 36) + '" y="' + (y + 4) + '" width="72" height="72" fill="none" stroke="#fff" stroke-width="1.2"/>' +
          '<text x="' + cx + '" y="' + (y + 44) + '" text-anchor="middle" font-family="Bodoni Moda, Didot, Georgia, serif" font-size="25" font-weight="600" fill="#fff">CCIX</text>' +
          '<line x1="' + (cx - 28) + '" y1="' + (y + 54) + '" x2="' + (cx + 28) + '" y2="' + (y + 54) + '" stroke="#fff" stroke-width=".8"/>' +
          '<text x="' + cx + '" y="' + (y + 64) + '" text-anchor="middle" font-family="Figtree, Arial, sans-serif" font-size="7.5" font-weight="700" letter-spacing="1.4" fill="#fff">EXCLUSIVE</text>';
        lines.forEach(function (ln, i) {
          s += '<text x="' + cx + '" y="' + (y + 112 + i * 17) + '" text-anchor="middle" font-family="Figtree, Arial, sans-serif" font-size="' + (ln.length > 9 ? 11.5 : 13.5) + '" letter-spacing="1.6" fill="#3b3734">' + esc(ln) + '</text>';
        });
        return s;
      };
      var sh = '<ellipse cx="200" cy="454" rx="74" ry="10" fill="#17120f" opacity=".14"/>';
      if (p.art === 'salon-bottle') {
        body = sh + '<path d="M164 104 q0-8 8-8 h56 q8 0 8 8 v58 h-72z" fill="url(#' + id + 'c)"/><rect x="164" y="150" width="72" height="4" fill="#000" opacity=".08"/>' +
          '<path d="M142 186 q0-24 26-24 h64 q26 0 26 24 v246 q0 20 -20 20 h-76 q-20 0 -20 -20z" fill="url(#' + id + 'b)"/>' + lab(200, 214);
      } else {
        body = sh + '<path d="M154 168 v-36 q0-38 46-38 q46 0 46 38 v36z" fill="url(#' + id + 'c)"/><rect x="152" y="166" width="96" height="10" rx="3" fill="#b9b9b7"/>' +
          '<rect x="150" y="176" width="100" height="276" rx="10" fill="url(#' + id + 'b)"/>' + lab(200, 206);
      }
    } else {
      bg += '<linearGradient id="' + id + 'b" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="' + mixWith(tone, '#000', .12) + '"/><stop offset=".35" stop-color="' + lighten(tone, .35) + '"/><stop offset=".7" stop-color="' + tone + '"/><stop offset="1" stop-color="' + mixWith(tone, '#000', .18) + '"/></linearGradient>' +
        '<linearGradient id="' + id + 'k" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0d0a09"/><stop offset=".4" stop-color="#3b322d"/><stop offset="1" stop-color="#0d0a09"/></linearGradient></defs>';
      var label = function (x, y, w, h, small) {
        return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="4" fill="#fbf8f4" opacity=".92"/>' +
          '<text x="' + (x + w / 2) + '" y="' + (y + h * 0.48) + '" text-anchor="middle" font-family="Bodoni Moda, Georgia, serif" font-size="' + (small ? 20 : 26) + '" letter-spacing="4" fill="#17120f">CCIX</text>' +
          '<text x="' + (x + w / 2) + '" y="' + (y + h * 0.48 + (small ? 18 : 22)) + '" text-anchor="middle" font-family="Figtree, Arial, sans-serif" font-size="' + (small ? 8 : 9.5) + '" letter-spacing="1.6" fill="#6c1d2a">' + esc(p.name.toUpperCase()).slice(0, 26) + '</text>';
      };
      var shadow = function (cx, w) { return '<ellipse cx="' + cx + '" cy="452" rx="' + w + '" ry="10" fill="#17120f" opacity=".12"/>'; };
      if (p.art === 'bottle') body = shadow(200, 70) + '<rect x="184" y="92" width="32" height="40" rx="4" fill="url(#' + id + 'k)"/><path d="M140 160 q0-28 30-28 h60 q30 0 30 28 v268 q0 22 -22 22 h-76 q-22 0 -22 -22z" fill="url(#' + id + 'b)"/>' + label(146, 250, 108, 90);
      else if (p.art === 'jar') body = shadow(200, 96) + '<rect x="118" y="238" width="164" height="46" rx="8" fill="url(#' + id + 'k)"/><rect x="112" y="282" width="176" height="166" rx="18" fill="url(#' + id + 'b)"/>' + label(132, 318, 136, 92);
      else if (p.art === 'spray') body = shadow(200, 64) + '<path d="M176 84 h40 l18 12 h-26 v32 h-32z" fill="url(#' + id + 'k)"/><rect x="170" y="128" width="60" height="30" rx="6" fill="url(#' + id + 'k)"/><rect x="146" y="158" width="108" height="292" rx="26" fill="url(#' + id + 'b)"/>' + label(152, 262, 96, 92, true);
      else if (p.art === 'dropper') body = shadow(200, 54) + '<path d="M186 104 q14 -40 28 0 v56 h-28z" fill="url(#' + id + 'k)"/><rect x="178" y="160" width="44" height="40" rx="6" fill="url(#' + id + 'k)"/><path d="M152 230 q0-30 30-30 h36 q30 0 30 30 v198 q0 22 -22 22 h-52 q-22 0 -22 -22z" fill="url(#' + id + 'b)" opacity=".95"/>' + label(158, 300, 84, 86, true);
      else if (p.art === 'brush') body = shadow(200, 58) + '<rect x="186" y="250" width="28" height="200" rx="14" fill="url(#' + id + 'k)"/><ellipse cx="200" cy="170" rx="72" ry="104" fill="url(#' + id + 'k)"/><ellipse cx="200" cy="170" rx="58" ry="88" fill="#2b2420"/>' + dots(200, 170, 50, 78, '#e9dccb') ;
      else if (p.art === 'tape') { body = shadow(200, 110); for (var t = 0; t < 6; t++) body += '<rect x="' + (110 + t * 6) + '" y="' + (170 + t * 40) + '" width="170" height="30" rx="3" fill="#fbf8f4" stroke="#d9cbbb"/><rect x="' + (110 + t * 6) + '" y="' + (170 + t * 40) + '" width="170" height="30" rx="3" fill="#6c1d2a" opacity=".08"/>'; body += '<text x="200" y="140" text-anchor="middle" font-family="Bodoni Moda, Georgia, serif" font-size="24" letter-spacing="4" fill="#17120f">CCIX</text>'; }
      else if (p.art === 'beads') {
        var bc = { Black: '#1a1513', Brown: '#6b4a33', Blonde: '#c9ad84' }[(sel && sel.Color) || 'Brown'] || '#6b4a33';
        body = shadow(200, 92) + '<rect x="122" y="196" width="156" height="40" rx="8" fill="url(#' + id + 'k)"/><rect x="114" y="234" width="172" height="214" rx="22" fill="#fbf8f4" opacity=".55" stroke="#d9cbbb"/>' + beadPile(200, 380, bc) + label(140, 250, 120, 64, true);
      }
      else if (p.art === 'pliers') body = shadow(200, 80) + '<path d="M196 110 l-60 300 q-4 22 14 24 q16 2 20 -18 l42 -230z" fill="url(#' + id + 'k)"/><path d="M204 110 l60 300 q4 22 -14 24 q-16 2 -20 -18 l-42 -230z" fill="url(#' + id + 'k)"/><circle cx="200" cy="190" r="12" fill="#c8b8a6"/><path d="M190 70 h20 l-4 46 h-12z" fill="#8d8178"/>';
    }
    return '<svg viewBox="0 0 400 500" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="' + esc(p.name) + '" preserveAspectRatio="xMidYMid slice">' + bg + '<rect width="400" height="500" fill="url(#' + id + 'bg)"/>' + body + '</svg>';
  }
  function mix(a, b) { return mixWith(a, b, .5); }
  function mixWith(a, b, t) {
    var x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
    var r = Math.round((x >> 16) * (1 - t) + (y >> 16) * t), g = Math.round(((x >> 8) & 255) * (1 - t) + ((y >> 8) & 255) * t), bl = Math.round((x & 255) * (1 - t) + (y & 255) * t);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
  }
  function dots(cx, cy, rx, ry, c) {
    var s = '';
    for (var yy = -ry + 10; yy <= ry - 10; yy += 14) for (var xx = -rx + 8; xx <= rx - 8; xx += 14) {
      if ((xx * xx) / (rx * rx) + (yy * yy) / (ry * ry) < 0.86) s += '<circle cx="' + (cx + xx) + '" cy="' + (cy + yy) + '" r="3.2" fill="none" stroke="' + c + '" stroke-width="1.6"/>';
    }
    return s;
  }
  function beadPile(cx, cy, c) {
    var s = '';
    for (var i = 0; i < 46; i++) {
      var a = i * 2.4, r = 6 + (i % 9) * 6;
      var x = cx + Math.cos(a) * r * 1.3, y = cy + Math.sin(a) * r * 0.5 + 10;
      s += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="6" fill="' + c + '" stroke="#fff" stroke-opacity=".35"/>';
    }
    return s;
  }
  // If a real photo exists for this product, show it over the drawing.
  function photoize(el, slug) {
    var src = url('images/products/' + slug + '.jpg');
    var img = new Image();
    img.onload = function () {
      var d = document.createElement('div'); d.className = 'photo'; d.style.backgroundImage = 'url("' + src + '")';
      el.appendChild(d);
    };
    img.src = src;
  }
  function swatchesHtml(p) {
    if (!(p.options || []).some(function (o) { return o.shades; })) return '';
    return '<div class="swatches" aria-label="' + C.shades.length + ' shades">' + C.shades.slice(0, 8).map(function (s) {
      return '<i style="background:' + (s.hex2 ? 'linear-gradient(135deg,' + s.hex + ' 50%,' + s.hex2 + ' 50%)' : s.hex) + '"></i>';
    }).join('') + '<span class="small muted">+' + (C.shades.length - 8) + '</span></div>';
  }

  // Each extension card shows a different shade so the grid isn't uniform.
  var CARD_SHADES = ['6/22', '1B', '18', '4/18', '60', '4', '22', '8'];
  function cardSel(p) {
    if (p.art !== 'hair') return null;
    var i = C.products.filter(function (x) { return x.art === 'hair'; }).indexOf(p);
    return { Shade: CARD_SHADES[i % CARD_SHADES.length] };
  }
  // Product card for grids.
  function card(p) {
    var t = tier();
    var price;
    if (t === 'pro') price = '<span class="pro">' + rangeText(p, 'pro') + '</span><s>' + money0(priceRange(p, 'retail').min) + '</s>';
    else price = p.proOnly ? '<span>' + rangeText(p, 'retail') + '</span><span class="small muted">· Pro only</span>' : '<span>' + rangeText(p, 'retail') + '</span>';
    var badge = p.proOnly ? '<span class="badge pro">Pro</span>' : '';
    return '<a class="pcard" href="' + url('products/' + p.slug + '/') + '"><div class="art" data-photo="' + p.slug + '">' + badge + art(p, cardSel(p)) + '</div>' +
      '<div><h3>' + esc(p.name) + '</h3><div class="unit">' + esc(p.unit) + '</div></div>' + swatchesHtml(p) +
      '<div class="price-line">' + price + '</div></a>';
  }
  function hydrateCards(scope) {
    (scope || document).querySelectorAll('[data-photo]').forEach(function (el) {
      if (el._ph) return; el._ph = 1; photoize(el, el.getAttribute('data-photo'));
    });
  }

  // ------------------------------------------------------------ boot
  document.addEventListener('DOMContentLoaded', function () {
    updateHeader();
    var btn = document.querySelector('.menu-btn');
    if (btn) btn.addEventListener('click', function () {
      var open = document.body.classList.toggle('nav-open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.querySelectorAll('[data-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });
    if (!CCIX_CONFIG.sampleCatalog) document.querySelectorAll('.sample-bar').forEach(function (el) { el.remove(); });
    window.addEventListener('storage', function (e) { if (e.key === CART_KEY) updateHeader(); });
  });

  // Order + application notices (FormSubmit). Silent if no address is set.
  function notify(subject, fields) {
    var to = (CCIX_CONFIG.orderEmail || '').trim();
    if (!to) return Promise.resolve();
    var body = Object.assign({ _subject: subject, _template: 'table', _captcha: 'false' }, fields);
    return fetch('https://formsubmit.co/ajax/' + encodeURIComponent(to), {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(body)
    }).catch(function () {});
  }

  return {
    C: C, esc: esc, money: money, money0: money0, url: url, product: product, defaultSel: defaultSel,
    optionValues: optionValues, shade: function (c) { return shadeBy[c]; }, sku: sku, variantLabel: variantLabel, allSkus: allSkus,
    priceOf: priceOf, priceRange: priceRange, rangeText: rangeText,
    tier: tier, profile: function () { return profile; }, setProfile: setProfile, onReady: onReady,
    cart: { read: cartRead, add: cartAdd, setQty: cartSetQty, clear: cartClear, count: cartCount },
    totals: totals, art: art, card: card, hydrateCards: hydrateCards, photoize: photoize, toast: toast, notify: notify,
    updateHeader: updateHeader
  };
})();
