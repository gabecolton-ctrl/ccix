// login.js — sign in / create account (optionally as a pro) / reset password.
(function () {
  var wrap = document.getElementById('auth');
  if (!wrap) return;
  var params = new URLSearchParams(location.search);
  var next = params.get('next') || '';
  var inForm = document.getElementById('signin-form'), upForm = document.getElementById('signup-form');
  var tabs = wrap.querySelectorAll('.tabs button');
  var proBox = document.getElementById('pro-fields'), proCheck = upForm.elements.is_pro;
  var busy = false;

  function go() {
    var dest = next === 'checkout' ? 'checkout/' : next === 'pro' ? 'account/#pro' : 'account/';
    location.href = Store.url(dest);
  }
  function tab(which) {
    tabs.forEach(function (b) { b.setAttribute('aria-selected', b.getAttribute('data-tab') === which ? 'true' : 'false'); });
    inForm.hidden = which !== 'in'; upForm.hidden = which !== 'up';
  }
  function msg(form, text, kind) {
    var el = form.querySelector('.form-msg');
    el.hidden = !text; el.className = 'form-msg notice ' + (kind || 'err'); el.innerHTML = text || '';
  }
  tabs.forEach(function (b) { b.addEventListener('click', function () { tab(b.getAttribute('data-tab')); }); });
  proCheck.addEventListener('change', function () { proBox.hidden = !proCheck.checked; });

  if (location.hash === '#create' || params.get('pro') === '1') tab('up'); else tab('in');
  if (params.get('pro') === '1') { proCheck.checked = true; proBox.hidden = false; }

  inForm.addEventListener('submit', function (e) {
    e.preventDefault(); if (busy) return; busy = true; msg(inForm, '');
    Backend.signIn(inForm.email.value, inForm.password.value).then(go).catch(function (err) {
      busy = false; msg(inForm, err.message);
    });
  });
  document.getElementById('forgot').addEventListener('click', function () {
    var email = inForm.email.value.trim();
    if (!email) { msg(inForm, 'Enter your email above first, then tap "Forgot password?" again.', 'warn'); inForm.email.focus(); return; }
    Backend.resetPassword(email).then(function () { msg(inForm, 'If there\'s an account for ' + Store.esc(email) + ', a reset link is on its way.', 'ok'); })
      .catch(function (err) { msg(inForm, err.message); });
  });

  upForm.addEventListener('submit', function (e) {
    e.preventDefault(); if (busy) return; msg(upForm, '');
    var f = upForm;
    if (!f.name.value.trim()) { msg(upForm, 'Please add your name.'); f.name.focus(); return; }
    var app = null;
    if (proCheck.checked) {
      app = ProApply.read(f);
      var miss = ProApply.missing(app);
      if (miss) { msg(upForm, 'Please fill in your salon, license number and city.'); f.elements[miss].focus(); return; }
    }
    busy = true;
    var extra = { name: f.name.value.trim(), phone: f.phone.value.trim(), createdAt: Backend.now() };
    Backend.signUp(f.email.value, f.password.value).then(function (cred) {
      var user = Backend.user() || { uid: cred.user.uid, email: cred.user.email.toLowerCase() };
      var save = app ? ProApply.submit(user, app, extra) : Backend.saveProfile(user.uid, Object.assign({ email: user.email }, extra));
      return save.then(function () { go(); });
    }).catch(function (err) { busy = false; msg(upForm, err.message); });
  });

  Store.onReady(function (u) { if (u && !params.get('stay')) go(); });
})();
