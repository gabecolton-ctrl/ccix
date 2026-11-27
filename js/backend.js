// backend.js — one interface over Firebase (live) or localStorage (demo mode).
// Every page talks to `Backend`; nothing else touches Firebase directly.
//
// Firestore layout
//   users/{uid}      { email, name, phone, createdAt, address{…},
//                      pro: { status: pending|approved|denied, salon, license,
//                             instagram, website, city, resaleCert, taxExempt,
//                             appliedAt, decidedAt } }
//   orders/{id}      { number, userId, email, name, phone, items[], pricing:
//                      retail|pro, subtotal, shipping, tax, total, payment,
//                      shipTo{…}, notes, status: pending|paid|shipped|cancelled,
//                      tracking, createdAt, updatedAt, stockTaken }
//   stock/{sku}      { qty }   — no document = not tracked (always available)
//   settings/store   { shippingFlat, freeShipOver, proShippingFlat,
//                      proFreeShipOver, taxRate, zelle, venmo, cashapp }

var Backend = (function () {
  var live = !!(window.firebaseConfig && window.firebase);
  var listeners = [];
  var current = null; // { uid, email }

  function isAdminEmail(email) {
    email = String(email || '').toLowerCase();
    if (!live) return email.indexOf('admin') !== -1;
    return CCIX_CONFIG.adminEmails.indexOf(email) !== -1;
  }
  function now() { return new Date().toISOString(); }
  function emit() { listeners.forEach(function (fn) { try { fn(current); } catch (e) { console.error(e); } }); }

  // ------------------------------------------------------------ demo store
  var LS = {
    get: function (k, d) { try { var v = localStorage.getItem('ccix_demo_' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('ccix_demo_' + k, JSON.stringify(v)); } catch (e) {} }
  };
  function demoUid(email) { return 'u_' + email.toLowerCase().replace(/[^a-z0-9]/g, '_'); }

  var demo = {
    init: function () {
      current = LS.get('session', null);
      setTimeout(emit, 0);
    },
    signIn: function (email, password) {
      var accts = LS.get('accounts', {});
      var a = accts[email.toLowerCase()];
      if (!a || a.password !== password) return Promise.reject(new Error('Email or password is incorrect.'));
      current = { uid: a.uid, email: email.toLowerCase() }; LS.set('session', current); emit();
      return Promise.resolve(current);
    },
    signUp: function (email, password) {
      email = email.toLowerCase();
      var accts = LS.get('accounts', {});
      if (accts[email]) return Promise.reject(new Error('An account with that email already exists. Try signing in.'));
      if (String(password).length < 6) return Promise.reject(new Error('Password must be at least 6 characters.'));
      accts[email] = { uid: demoUid(email), password: password }; LS.set('accounts', accts);
      current = { uid: accts[email].uid, email: email }; LS.set('session', current); emit();
      return Promise.resolve(current);
    },
    signOut: function () { current = null; LS.set('session', null); emit(); return Promise.resolve(); },
    resetPassword: function () { return Promise.resolve(); },
    getProfile: function (uid) { return Promise.resolve((LS.get('users', {}))[uid] || null); },
    saveProfile: function (uid, data) {
      var users = LS.get('users', {}); users[uid] = Object.assign({}, users[uid] || {}, data); LS.set('users', users);
      return Promise.resolve();
    },
    listUsers: function () {
      var users = LS.get('users', {});
      return Promise.resolve(Object.keys(users).map(function (k) { return Object.assign({ uid: k }, users[k]); }));
    },
    placeOrder: function (order) {
      var orders = LS.get('orders', {}); var id = 'o_' + Date.now();
      orders[id] = order; LS.set('orders', orders); return Promise.resolve(id);
    },
    myOrders: function (uid) {
      var orders = LS.get('orders', {});
      return Promise.resolve(Object.keys(orders).map(function (k) { return Object.assign({ id: k }, orders[k]); })
        .filter(function (o) { return o.userId === uid; }));
    },
    allOrders: function () {
      var orders = LS.get('orders', {});
      return Promise.resolve(Object.keys(orders).map(function (k) { return Object.assign({ id: k }, orders[k]); }));
    },
    updateOrder: function (id, data) {
      var orders = LS.get('orders', {}); orders[id] = Object.assign({}, orders[id], data); LS.set('orders', orders);
      return Promise.resolve();
    },
    getStock: function () { return Promise.resolve(LS.get('stock', {})); },
    setStock: function (sku, qty) {
      var s = LS.get('stock', {}); if (qty === null) delete s[sku]; else s[sku] = qty; LS.set('stock', s); return Promise.resolve();
    },
    adjustStock: function (changes) { // { sku: -2, … }
      var s = LS.get('stock', {});
      Object.keys(changes).forEach(function (k) { if (typeof s[k] === 'number') s[k] = Math.max(0, s[k] + changes[k]); });
      LS.set('stock', s); return Promise.resolve();
    },
    getSettings: function () { return Promise.resolve(LS.get('settings', {})); },
    saveSettings: function (data) { LS.set('settings', Object.assign(LS.get('settings', {}), data)); return Promise.resolve(); }
  };

  // ------------------------------------------------------------ firebase
  var fb = {
    init: function () {
      if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
      firebase.auth().onAuthStateChanged(function (u) {
        current = u ? { uid: u.uid, email: String(u.email || '').toLowerCase() } : null;
        emit();
      });
    },
    db: function () { return firebase.firestore(); },
    signIn: function (email, password) {
      return firebase.auth().signInWithEmailAndPassword(email, password).catch(function (e) { throw friendly(e); });
    },
    signUp: function (email, password) {
      return firebase.auth().createUserWithEmailAndPassword(email, password).catch(function (e) { throw friendly(e); });
    },
    signOut: function () { return firebase.auth().signOut(); },
    resetPassword: function (email) { return firebase.auth().sendPasswordResetEmail(email).catch(function (e) { throw friendly(e); }); },
    getProfile: function (uid) {
      return fb.db().collection('users').doc(uid).get().then(function (d) { return d.exists ? d.data() : null; });
    },
    saveProfile: function (uid, data) { return fb.db().collection('users').doc(uid).set(data, { merge: true }); },
    listUsers: function () {
      return fb.db().collection('users').get().then(function (s) { return s.docs.map(function (d) { return Object.assign({ uid: d.id }, d.data()); }); });
    },
    placeOrder: function (order) { return fb.db().collection('orders').add(order).then(function (r) { return r.id; }); },
    myOrders: function (uid) {
      return fb.db().collection('orders').where('userId', '==', uid).get()
        .then(function (s) { return s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); });
    },
    allOrders: function () {
      return fb.db().collection('orders').orderBy('createdAt', 'desc').limit(500).get()
        .then(function (s) { return s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); });
    },
    updateOrder: function (id, data) { return fb.db().collection('orders').doc(id).update(data); },
    getStock: function () {
      return fb.db().collection('stock').get().then(function (s) {
        var out = {}; s.docs.forEach(function (d) { out[d.id] = d.data().qty; }); return out;
      });
    },
    setStock: function (sku, qty) {
      var ref = fb.db().collection('stock').doc(sku);
      return qty === null ? ref.delete() : ref.set({ qty: qty });
    },
    adjustStock: function (changes) {
      var db = fb.db();
      // Only touch SKUs that are tracked: untracked ones have no doc and stay untracked.
      return fb.getStock().then(function (s) {
        var b = db.batch(), n = 0;
        Object.keys(changes).forEach(function (k) {
          if (typeof s[k] === 'number') { b.set(db.collection('stock').doc(k), { qty: Math.max(0, s[k] + changes[k]) }); n++; }
        });
        return n ? b.commit() : null;
      });
    },
    getSettings: function () {
      return fb.db().collection('settings').doc('store').get().then(function (d) { return d.exists ? d.data() : {}; });
    },
    saveSettings: function (data) { return fb.db().collection('settings').doc('store').set(data, { merge: true }); }
  };

  function friendly(e) {
    var code = (e && e.code) || '';
    var map = {
      'auth/invalid-credential': 'Email or password is incorrect.',
      'auth/wrong-password': 'Email or password is incorrect.',
      'auth/user-not-found': 'No account with that email. Create one instead?',
      'auth/email-already-in-use': 'An account with that email already exists. Try signing in.',
      'auth/weak-password': 'Password must be at least 6 characters.',
      'auth/invalid-email': 'That email address doesn\'t look right.',
      'auth/too-many-requests': 'Too many attempts. Wait a minute and try again.'
    };
    return new Error(map[code] || (e && e.message) || 'Something went wrong.');
  }

  var impl = live ? fb : demo;
  impl.init();

  return {
    live: live,
    user: function () { return current; },
    isAdmin: function () { return !!current && isAdminEmail(current.email); },
    onAuth: function (fn) { listeners.push(fn); },
    signIn: function (e, p) { return impl.signIn(e.trim(), p); },
    signUp: function (e, p) { return impl.signUp(e.trim(), p); },
    signOut: function () { return impl.signOut(); },
    resetPassword: function (e) { return impl.resetPassword(e.trim()); },
    getProfile: impl.getProfile, saveProfile: impl.saveProfile, listUsers: impl.listUsers,
    placeOrder: impl.placeOrder, myOrders: impl.myOrders, allOrders: impl.allOrders, updateOrder: impl.updateOrder,
    getStock: impl.getStock, setStock: impl.setStock, adjustStock: impl.adjustStock,
    getSettings: function () {
      return impl.getSettings().then(function (s) { return Object.assign({}, CCIX_CONFIG.defaults, s || {}); })
        .catch(function () { return Object.assign({}, CCIX_CONFIG.defaults); });
    },
    saveSettings: impl.saveSettings,
    now: now
  };
})();
