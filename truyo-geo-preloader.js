/*!
 * Truyo Interim Geo Pre-loader + Preference Center Toggle Defaults
 * - US = Opt-Out (banner hidden, optional toggles default ON)
 * - Rest of World = Opt-In (banner shown, optional toggles default OFF)
 * - Only applies toggle defaults on first visit (before explicit consent is saved).
 */
;(function (window, document) {
  'use strict';

  var CFG = {
    apiUrl: 'https://solarsystem-dev.truyo.com/api/v1/geolocation/country/ip/myIP',
    timeoutMs: 1500,
    cacheKey: 'truyoGeoV1',
    cacheTtlMs: 24 * 60 * 60 * 1000, // 24h
    optOutCountries: ['US'],
    bannerSelector: '#truyo-consent-module',
    settingsTrigger: '#cookieSettingButton, .truyoCookieSettingButton',
    toggleSelector: 'input.switch-input.optedInOutCookieCategory'
  };

  var cfg = window.truyoConfig = window.truyoConfig || {};
  cfg.geoLoaded = false;
  cfg.isOptInModel = true; // Fail-safe strict default
  cfg.countryCode = null;
  cfg.source = 'pending';

  // ---- 1. Banner flicker guard ----
  var styleEl = document.createElement('style');
  styleEl.id = 'truyo-geo-hide';
  styleEl.appendChild(document.createTextNode(CFG.bannerSelector + '{display:none!important}'));
  (document.head || document.documentElement).appendChild(styleEl);

  function setBannerHidden(hidden) {
    var inDom = document.getElementById('truyo-geo-hide');
    if (hidden && !inDom) (document.head || document.documentElement).appendChild(styleEl);
    if (!hidden && inDom) inDom.parentNode.removeChild(inDom);
  }

  // ---- 2. Geo helpers ----
  function validCountry(c) {
    return typeof c === 'string' && /^[A-Za-z]{2}$/.test(c);
  }

  function hasExplicitConsent() {
    var m = document.cookie.match(/(^|;\s*)truyoConsent=([^;]*)/);
    if (!m) return false;
    try { return !!JSON.parse(decodeURIComponent(m[2])).consumerCookieId; }
    catch (e) { return m[2].indexOf('consumerCookieId') !== -1; }
  }

  function readCache() {
    try {
      var o = JSON.parse(localStorage.getItem(CFG.cacheKey));
      if (o && validCountry(o.c) && (Date.now() - o.t) < CFG.cacheTtlMs) return o.c.toUpperCase();
    } catch (e) {}
    return null;
  }

  function writeCache(c) {
    try { localStorage.setItem(CFG.cacheKey, JSON.stringify({ c: c, t: Date.now() })); } catch (e) {}
  }

  function applyGeo(country, source) {
    var code = validCountry(country) ? country.toUpperCase() : null;
    var optIn = !(code && CFG.optOutCountries.indexOf(code) !== -1);

    cfg.countryCode = code;
    cfg.isOptInModel = optIn;
    cfg.source = source;
    cfg.geoLoaded = true;

    setBannerHidden(!optIn);

    try {
      document.dispatchEvent(new CustomEvent('truyoGeoResolved', { detail: { config: cfg } }));
    } catch (e) {}
  }

  // ---- 3. Bidirectional Preference Center Toggle Sync ----
  var userTouched = false;

  function fireEvent(el, type) {
    var ev;
    try { ev = new Event(type, { bubbles: true }); }
    catch (e) { ev = document.createEvent('Event'); ev.initEvent(type, true, false); }
    el.dispatchEvent(ev);
  }

  function syncToggles() {
    if (userTouched || !cfg.geoLoaded || hasExplicitConsent()) return;

    // Opt-In (International) -> false (OFF) | Opt-Out (US) -> true (ON)
    var desiredState = !cfg.isOptInModel;
    var inputs = document.querySelectorAll(CFG.toggleSelector);

    for (var i = 0; i < inputs.length; i++) {
      var el = inputs[i];
      if (el.disabled || el.checked === desiredState) continue;

      el.click(); // Trigger Truyo's native click handler
      if (el.checked !== desiredState) {
        el.checked = desiredState;
        fireEvent(el, 'input');
        fireEvent(el, 'change');
      }
    }
  }

  function startToggleSync() {
    userTouched = false;
    var waited = 0;
    var stepMs = 150;
    var maxWaitMs = 6000;

    (function tick() {
      if (userTouched || hasExplicitConsent()) return;
      syncToggles();
      waited += stepMs;
      if (waited < maxWaitMs) setTimeout(tick, stepMs);
    })();
  }

  // Delegated capture listener for Cookie Settings button and manual toggle clicks
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    if (t.closest(CFG.settingsTrigger)) {
      setTimeout(startToggleSync, 600); // Wait for Truyo to render modal DOM
      return;
    }
    // Real user clicks are trusted; our programmatic el.click() is untrusted
    if (e.isTrusted && t.closest('.switchbtn, ' + CFG.toggleSelector)) {
      userTouched = true;
    }
  }, true);

  // ---- 4. Execute Geo Resolution ----
  var cached = readCache();
  if (cached) {
    applyGeo(cached, 'cache');
    return;
  }

  var settled = false;
  var timer = setTimeout(function () {
    if (!settled) {
      settled = true;
      applyGeo(null, 'default');
    }
  }, CFG.timeoutMs);

  try {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', CFG.apiUrl, true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      var country = null;
      if (xhr.status === 200) {
        try { country = JSON.parse(xhr.responseText).countryCode; } catch (e) {}
      }
      if (validCountry(country)) {
        clearTimeout(timer);
        settled = true;
        writeCache(country.toUpperCase());
        applyGeo(country, 'api');
      } else if (!settled) {
        clearTimeout(timer);
        settled = true;
        applyGeo(null, 'default');
      }
    };
    xhr.send();
  } catch (e) {
    clearTimeout(timer);
    if (!settled) {
      settled = true;
      applyGeo(null, 'default');
    }
  }
})(window, document);
