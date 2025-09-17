// If you have a global window.firebaseConfig already on the page, this will reuse it.
// Otherwise, create overlay/mp-config.js from mp-config.sample.js with your Firebase config.
window.MP_CONFIG = window.MP_CONFIG || (window.firebaseConfig ? { firebase: window.firebaseConfig } : null);
