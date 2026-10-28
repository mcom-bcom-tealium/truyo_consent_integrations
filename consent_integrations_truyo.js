//tv:1.0.0
//base:truyo
/**
 * @module utcm/integration
 * @description CMP-specific component for Truyo.
 *
 * 1.0.0
 *  - Initial version for Truyo consent integration.
 *  - Implements dynamic script scraping for Vendor ID across Prod/Staging/Dev CDNs.
 *  - Supports Truyo's Base64 LocalStorage payload and `truyoConsent` explicit cookie.
 *  - Includes 150ms delay on update events to prevent Tealium/Truyo race conditions.
 *  - Pre-configured to accept a future synchronous window.truyoConfig geolocation object.
 */

;(function truyoConsentIntegration(window, document) {
  window.tealiumCmpIntegration = window.tealiumCmpIntegration || {};

  window.tealiumCmpIntegration.cmpName = 'Truyo';
  window.tealiumCmpIntegration.cmpIntegrationVersion = 'truyo-1.0.0';

  // Attach framework methods
  window.tealiumCmpIntegration.cmpFetchCurrentConsentDecision = cmpFetchCurrentConsentDecision;
  window.tealiumCmpIntegration.cmpFetchCurrentLookupKey = cmpFetchCurrentLookupKey;
  window.tealiumCmpIntegration.cmpCheckIfOptInModel = cmpCheckIfOptInModel;
  window.tealiumCmpIntegration.cmpCheckForWellFormedDecision = cmpCheckForWellFormedDecision;
  window.tealiumCmpIntegration.cmpCheckForExplicitConsentDecision = cmpCheckForExplicitConsentDecision;
  window.tealiumCmpIntegration.cmpCheckForTiqConsent = cmpCheckForTiqConsent;
  window.tealiumCmpIntegration.cmpConvertResponseToGroupList = cmpConvertResponseToGroupList;
  window.tealiumCmpIntegration.cmpAddCallbackToTriggerRecheck = cmpAddCallbackToTriggerRecheck;

  // 1. Operating Model
  function cmpCheckIfOptInModel() {
    // [FUTURE UPDATE PREP]: Reads dynamic model if Truyo's future Geo API has completed
    if (window.truyoConfig && window.truyoConfig.geoLoaded && typeof window.truyoConfig.isOptInModel === 'boolean') {
      return window.truyoConfig.isOptInModel;
    }
    
    // [CURRENT DEFAULT]: Defaults to Opt-in to prevent illegal tracking in strict regions
    // while waiting for the Truyo script to fully load.
    return true; 
  }

  // 2. Fetch Raw Decision from Truyo's Base64 LocalStorage
  function cmpFetchCurrentConsentDecision() {
    try {
      var raw = localStorage.getItem('truyoConsentOptOut');
      if (!raw) return {};
      return JSON.parse(atob(raw));
    } catch (e) {
      return {};
    }
  }

  // 3. Dynamic Key Scraper (Development, Staging, Production)
  function cmpFetchCurrentLookupKey() {
    var scripts = document.getElementsByTagName('script');
    var re = /(?:truyoproductionuscdn|truyodevelopmentcdn|truyostagingcdn)\.truyo\.com\/js\/([a-f0-9]+)\.js/i;

    for (var i = 0; i < scripts.length; i++) {
      var match = re.exec(scripts[i].src);
      if (match && match[1]) {
        return match[1];
      }
    }

    // Fallback: Reads Vendor ID directly from Tealium UI if script tag is obscured
    return (window.tealiumCmpIntegration &&
            window.tealiumCmpIntegration.map &&
            Object.keys(window.tealiumCmpIntegration.map)[0]) || 'truyo-default';
  }

  // 4. Validate Decision Object
  function cmpCheckForWellFormedDecision(cmpRawOutput) {
    // [FUTURE UPDATE PREP]: If Truyo signals that a Geo API lookup is currently in progress,
    // return false to force Tealium to safely queue events and poll until the API finishes.
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
    var lookupKey = cmpFetchCurrentLookupKey();
    var allConfiguredPurposes = [];

    if (window.tealiumCmpIntegration.map && window.tealiumCmpIntegration.map[lookupKey]) {
      allConfiguredPurposes = Object.keys(window.tealiumCmpIntegration.map[lookupKey]);
    } else {
      // Base fallback mapping using your specific category strings
      allConfiguredPurposes = ['necessary', 'functional', 'advertising', 'performance'];
    }

    return allConfiguredPurposes.filter(function(purpose) {
      return optedOutPurposes.indexOf(purpose) === -1;
    });
  }

  // 7. Check TiQ Consent
  function cmpCheckForTiqConsent(cmpRawOutput, tiqGroupName) {
    if (!cmpCheckForWellFormedDecision(cmpRawOutput)) return false;
    tiqGroupName = tiqGroupName || 'necessary';
    var allowedGroups = cmpConvertResponseToGroupList(cmpRawOutput);
    return allowedGroups.indexOf(tiqGroupName) !== -1;
  }

  // 8. Event Listener for Rechecks
  function cmpAddCallbackToTriggerRecheck(triggerRecheck) {
    if (typeof triggerRecheck !== 'function') return;
    document.addEventListener('truyoCookieSettingsUpdateEvent', function(e) {
      // 150ms delay guarantees Truyo has finished updating LocalStorage and Cookies
      // before Tealium attempts to read the new state.
      setTimeout(function() {
        triggerRecheck(e);
      }, 150);
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
