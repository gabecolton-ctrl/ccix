// pro-apply.js — reads the pro application fields and submits them.
var ProApply = {
  read: function (form) {
    var g = function (n) { return form.elements[n] ? String(form.elements[n].value || '').trim() : ''; };
    return {
      salon: g('pro_salon'), license: g('pro_license'), city: g('pro_city'),
      instagram: g('pro_instagram'), website: g('pro_website'),
      resaleCert: g('pro_resale'), role: g('pro_role')
    };
  },
  missing: function (a) {
    if (!a.salon) return 'pro_salon';
    if (!a.license) return 'pro_license';
    if (!a.city) return 'pro_city';
    return '';
  },
  submit: function (user, app, extra) {
    var pro = Object.assign({}, app, { status: 'pending', taxExempt: false, appliedAt: Backend.now() });
    var data = Object.assign({ email: user.email, pro: pro }, extra || {});
    return Backend.saveProfile(user.uid, data).then(function () {
      Store.notify('New CCIX pro application — ' + app.salon, {
        Email: user.email, Name: (extra && extra.name) || '', Phone: (extra && extra.phone) || '',
        Salon: app.salon, Role: app.role, 'License #': app.license, City: app.city,
        Instagram: app.instagram || '—', Website: app.website || '—', 'Resale certificate #': app.resaleCert || '—',
        Review: 'Approve or deny on Admin → Pros'
      });
      return data;
    });
  }
};
