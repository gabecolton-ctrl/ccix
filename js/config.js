// config.js — store-wide settings you edit by hand.

var CCIX_CONFIG = {
  // Accounts that see the Admin pages (lowercase).
  adminEmails: ['gabecolton@gmail.com'],

  // New-order and pro-application notices go here (FormSubmit, like TXBio).
  // The first email to a new address asks you to click "Activate" once.
  orderEmail: '', // e.g. 'orders@ccixhair.com'

  // Shows the yellow "sample catalog" strip until the real products are in.
  sampleCatalog: false,

  // Starting values. Once the store is live, change these on Admin → Settings
  // (saved in the database), which override what's here.
  defaults: {
    shippingFlat: 8.95,      // retail shipping per order
    freeShipOver: 150,       // retail orders at or above this ship free
    proShippingFlat: 12,     // pro shipping per order
    proFreeShipOver: 300,    // pro orders at or above this ship free
    taxRate: 8.25,           // % sales tax on retail orders (pros with a resale certificate are exempt)
    zelle: '', venmo: '', cashapp: '' // payment handles; a method only shows at checkout once filled in
  }
};

// Firebase project (Firebase console → Project settings → Your apps → Web app).
// Leave as null to run in DEMO MODE: accounts, carts and orders are kept in
// this browser only, and any email containing "admin" gets the admin pages.
var firebaseConfig = null;
/* Example:
var firebaseConfig = {
  apiKey: "…",
  authDomain: "ccix-hair.firebaseapp.com",
  projectId: "ccix-hair",
  storageBucket: "ccix-hair.firebasestorage.app",
  messagingSenderId: "…",
  appId: "…"
};
*/
