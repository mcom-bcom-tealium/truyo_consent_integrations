//tv:1.0.0
//base:truyo
/**
 * @module utcm/integration
 * @description CMP-specific component for Truyo.
 *
 * 1.2.0
 *  - Sets tealiumCmpIntegration.tiqGroupName ('necessary') to prevent framework blocking.
 *  - Handles implicit consent for US/Opt-out visitors when LocalStorage is empty.
 *  - Reads window.truyoConfig (from interim pre-loader or future native loader).
 *  - Listens for `truyoGeoResolved` to trigger immediate rechecks.
 *
 * 1.0.0
 *  - Initial version for Truyo consent integration.
 *  - Implements dynamic script scraping for Vendor ID across Prod/Staging/Dev CDNs.
 *  - Supports Truyo's Base64 LocalStorage payload and `truyoConsent` explicit cookie.
 *  - Includes 150ms delay on update events to prevent Tealium/Truyo race conditions.
 *  - Pre-configured to accept a future synchronous window.truyoConfig geolocation object.
 */

;(function truyoConsentIntegration(window, document) {
  var TIQ_GROUP_NAME = 'necessary';
  var FALLBACK_PURPOSES = ['necessary', 'functionality', 'advertising', 'performance'];

  window.tealiumCmpIntegration = window.tealiumCmpIntegration || {};

  window.tealiumCmpIntegration.cmpName = 'Truyo';
  window.tealiumCmpIntegration.cmpIntegrationVersion = 'truyo-1.2.0';
  window.tealiumCmpIntegration.tiqGroupName = window.tealiumCmpIntegration.tiqGroupName || TIQ_GROUP_NAME;

  // Attach framework methods
  window.tealiumCmpIntegration.cmpFetchCurrentConsentDecision = cmpFetchCurrentConsentDecision;
  window.tealiumCmpIntegration.cmpFetchCurrentLookupKey = cmpFetchCurrentLookupKey;
  window.tealiumCmpIntegration.cmpCheckIfOptInModel = cmpCheckIfOptInModel;
  window.tealiumCmpIntegration.cmpCheckForWellFormedDecision = cmpCheckForWellFormedDecision;
  window.tealiumCmpIntegration.cmpCheckForExplicitConsentDecision = cmpCheckForExplicitConsentDecision;
  window.tealiumCmpIntegration.cmpCheckForTiqConsent = cmpCheckForTiqConsent;
  window.tealiumCmpIntegration.cmpConvertResponseToGroupList = cmpConvertResponseToGroupList;
  window.tealiumCmpIntegration.cmpAddCallbackToTriggerRecheck = cmpAddCallbackToTriggerRecheck;

  function getAllPurposes() {
    var map = window.tealiumCmpIntegration.map;
    var key = cmpFetchCurrentLookupKey();
    return (map && map[key]) ? Object.keys(map[key]) : FALLBACK_PURPOSES;
  }

  // 1. Operating Model
  function cmpCheckIfOptInModel() {
    if (window.truyoConfig && window.truyoConfig.geoLoaded && typeof window.truyoConfig.isOptInModel === 'boolean') {
      return window.truyoConfig.isOptInModel;
    }
    // Fail-safe default: Opt-in while geo is unresolved
    return true;
  }

  // 2. Fetch Raw Decision from Truyo's Base64 LocalStorage
  function cmpFetchCurrentConsentDecision() {
    try {
      var raw = localStorage.getItem('truyoConsentOptOut');
      if (raw) {
        var stored = JSON.parse(atob(raw));
        if (stored && typeof stored === 'object') return stored;
      }
    } catch (e) {}

    // US / Opt-out visitors with no stored choice get implicit consent (nothing opted out)
    var cfg = window.truyoConfig;
    if (cfg && cfg.geoLoaded === true && cfg.isOptInModel === false) {
      return { optedOutCookiePurposes: [] };
    }

    return {};
  }

  // 3. Dynamic Key Scraper (Dev, Staging, Prod)
  function cmpFetchCurrentLookupKey() {
    var scripts = document.getElementsByTagName('script');
    var re = /(?:truyoproductionuscdn|truyodevelopmentcdn|truyostagingcdn)\.truyo\.com\/js\/([a-f0-9]+)\.js/i;

    for (var i = 0; i < scripts.length; i++) {
      var match = re.exec(scripts[i].src);
      if (match && match[1]) return match[1];
    }

    return (window.tealiumCmpIntegration &&
            window.tealiumCmpIntegration.map &&
            Object.keys(window.tealiumCmpIntegration.map)[0]) || 'truyo-default';
  }

  // 4. Validate Decision Object
  function cmpCheckForWellFormedDecision(cmpRawOutput) {
    // Pause Tealium and keep polling while geo lookup is in flight
    if (window.truyoConfig && window.truyoConfig.geoLoaded === false) {
      return false;
    }

    return typeof cmpRawOutput === 'object' &&
           cmpRawOutput !== null &&
           Array.isArray(cmpRawOutput.optedOutCookiePurposes);
  }

  // 5. Check Explicit Consent via truyoConsent Cookie
  function cmpCheckForExplicitConsentDecision(cmpRawOutput) {
    if (!cmpCheckForWellFormedDecision(cmpRawOutput)) return false;

    var cookieMatch = document.cookie.match(/(^|;\s*)truyoConsent=([^;]*)/);
    if (!cookieMatch) return false;

    try {
      var parsedCookie = JSON.parse(decodeURIComponent(cookieMatch[2]));
      return typeof parsedCookie.consumerCookieId === 'string' && parsedCookie.consumerCookieId.length > 0;
    } catch (e) {
      return cookieMatch[2].indexOf('consumerCookieId') !== -1;
    }
  }

  // 6. Convert Truyo Opt-Outs to Consented Group List
  function cmpConvertResponseToGroupList(cmpRawOutput) {
    if (!cmpCheckForWellFormedDecision(cmpRawOutput)) return [];

    var optedOutPurposes = cmpRawOutput.optedOutCookiePurposes || [];
    return getAllPurposes().filter(function (purpose) {
      return optedOutPurposes.indexOf(purpose) === -1;
    });
  }

  // 7. Check TiQ Consent
  function cmpCheckForTiqConsent(cmpRawOutput, tiqGroupName) {
    if (!cmpCheckForWellFormedDecision(cmpRawOutput)) return false;
    tiqGroupName = tiqGroupName || TIQ_GROUP_NAME;
    return cmpConvertResponseToGroupList(cmpRawOutput).indexOf(tiqGroupName) !== -1;
  }

  // 8. Event Listeners for Rechecks
  function cmpAddCallbackToTriggerRecheck(triggerRecheck) {
    if (typeof triggerRecheck !== 'function') return;

    document.addEventListener('truyoCookieSettingsUpdateEvent', function (e) {
      setTimeout(function () { triggerRecheck(e); }, 150);
    });

    document.addEventListener('truyoGeoResolved', function (e) {
      triggerRecheck(e);
    });
  }
})(window, document);
/*
// --- Debugging / Development Output ---
// Repaste this entire template (including this block) into your browser console to test state changes
(function runDiagnostics() {
  if (!window.tealiumCmpIntegration) return console.error("Tealium CMP Integration not loaded.");
  
  var raw = window.tealiumCmpIntegration.cmpFetchCurrentConsentDecision();
  var outputString = `CMP Found: ${window.tealiumCmpIntegration.cmpName} (${window.tealiumCmpIntegration.cmpCheckIfOptInModel() ? "Opt-in" : 'Opt-out'} Model)
  Checks:
    - id:          ${window.tealiumCmpIntegration.cmpFetchCurrentLookupKey()}
    - well-formed: ${window.tealiumCmpIntegration.cmpCheckForWellFormedDecision(raw)}
    - explicit:    ${window.tealiumCmpIntegration.cmpCheckForExplicitConsentDecision(raw)}
    - group list:  ${JSON.stringify(window.tealiumCmpIntegration.cmpConvertResponseToGroupList(raw))}
  `;
  console.log(outputString);
})();
*/
