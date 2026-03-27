/**
 * Loads Stripe.js and mounts Embedded Checkout (card entry on your page).
 * Depends on Stripe V3: https://js.stripe.com/v3/
 */
(function (global) {
  function loadStripeJs() {
    return new Promise(function (resolve, reject) {
      if (global.Stripe) return resolve();
      var s = document.createElement('script');
      s.src = 'https://js.stripe.com/v3/';
      s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('Could not load Stripe (network).')); };
      document.head.appendChild(s);
    });
  }

  /**
   * @param {Object} opts
   * @param {string} opts.publishableKey - pk_test_... or pk_live_...
   * @param {string} opts.clientSecret - from Checkout Session (embedded)
   * @param {HTMLElement} opts.mountEl
   * @param {HTMLElement} [opts.loadingEl] - hidden after mount
   * @returns {Promise<Object>} Stripe Embedded Checkout instance (has .destroy())
   */
  function mountEmbeddedCheckout(opts) {
    return loadStripeJs().then(function () {
      var pk = opts.publishableKey;
      var cs = opts.clientSecret;
      if (!pk || !cs) {
        throw new Error('Missing Stripe configuration. Is STRIPE_PUBLISHABLE_KEY set on the server?');
      }
      var stripe = global.Stripe(pk);
      return stripe.initEmbeddedCheckout({ clientSecret: cs }).then(function (checkout) {
        checkout.mount(opts.mountEl);
        if (opts.loadingEl) opts.loadingEl.style.display = 'none';
        return checkout;
      });
    });
  }

  global.LitoClipsStripePay = {
    loadStripeJs: loadStripeJs,
    mountEmbeddedCheckout: mountEmbeddedCheckout,
  };
})(typeof window !== 'undefined' ? window : this);
