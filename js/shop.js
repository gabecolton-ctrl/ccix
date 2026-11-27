// shop.js — product grid with category filters (#extensions, #care, #tools).
(function () {
  var grid = document.getElementById('grid');
  var filters = document.getElementById('filters');
  if (!grid) return;
  var fixed = grid.getAttribute('data-category'); // category pages pass one in
  var limit = Number(grid.getAttribute('data-limit')) || 0;

  function current() {
    if (fixed) return fixed;
    var h = location.hash.replace('#', '');
    return Store.C.categories.some(function (c) { return c.id === h; }) ? h : 'all';
  }
  function render() {
    var cat = current();
    var list = Store.C.products.filter(function (p) { return cat === 'all' || p.category === cat; });
    if (limit) list = list.slice(0, limit);
    grid.innerHTML = list.map(Store.card).join('');
    Store.hydrateCards(grid);
    if (filters) filters.querySelectorAll('.chip').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-cat') === cat ? 'true' : 'false'); });
    var title = document.getElementById('shop-title');
    if (title && !fixed) {
      var c = Store.C.categories.filter(function (x) { return x.id === cat; })[0];
      title.textContent = c ? c.name : 'Shop all';
      var blurb = document.getElementById('shop-blurb');
      if (blurb) blurb.textContent = c ? c.blurb : 'Professional extensions, care and tools — retail for everyone, wholesale pricing for approved pros.';
    }
  }
  if (filters) {
    filters.innerHTML = '<button class="chip" data-cat="all">All</button>' + Store.C.categories.map(function (c) {
      return '<button class="chip" data-cat="' + c.id + '">' + Store.esc(c.name) + '</button>';
    }).join('');
    filters.addEventListener('click', function (e) {
      var b = e.target.closest('.chip'); if (!b) return;
      var c = b.getAttribute('data-cat');
      history.replaceState(null, '', c === 'all' ? location.pathname : '#' + c);
      render();
    });
  }
  window.addEventListener('hashchange', render);
  document.addEventListener('ccix:account', render);
  render();
})();
