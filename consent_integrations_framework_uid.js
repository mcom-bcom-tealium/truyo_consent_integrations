//tv:1.2.1
//base:framework
/**
 * @module utcm/framework
 * @description Component of the CMP integration, responsible for stopping Tealium iQ from loading/running as appropriate, and responsible for blocking tags if consent is missing or this CMP integration is misconfigured.
 * Expects the appropriate {@link tealiumCmpIntegration tealiumCmpIntegration} inputs (from {@link utcm/integration utcm/integration}) and an appropriate map (from Publish Engine).
 */
(function (window) {
    var version = "v1.2.1";
    /**
     * A window-scoped (global) object used to expose or define selected functionality.
     * @namespace tealiumCmpIntegration
     * @type {object}
     * @memberof! <global>
     */
    window.tealiumCmpIntegration = window.tealiumCmpIntegration || {};
    /**
     * The name of the CMP, provided by utcm/integration, mostly used for logging and debugging.
     * @name cmpName
     * @type {string}
     * @memberof! tealiumCmpIntegration
     */
    window.tealiumCmpIntegration.cmpName = window.tealiumCmpIntegration.cmpName || "Unnamed CMP";
    // for the consent information in the b object
    var nameOfFullGroupArray = window.tealiumCmpIntegration.nameOfFullGroupArray || "tci.purposes_with_consent_all";
    var nameOfUnprocessedGroupArray =
        window.tealiumCmpIntegration.nameOfUnprocessedGroupArray || "tci.purposes_with_consent_unprocessed";
    var nameOfProcessedGroupArray =
        window.tealiumCmpIntegration.nameOfProcessedGroupArray || "tci.purposes_with_consent_processed";
    var nameOfConsentTypeString = window.tealiumCmpIntegration.nameOfConsentTypeString || "tci.consent_type";
    var nameOfEventIdString = window.tealiumCmpIntegration.nameOfConsentTypeString || "tci.event_id";
    var nameOfImplicitQueueMarker = window.tealiumCmpIntegration.nameOfImplicitQueueMarker || "tci.from_implicit_queue"

    // default to NOT emiting events and NOT continuing to poll past the initial explicit decision
    tealiumCmpIntegration.suppressConsentRegister = tealiumCmpIntegration.suppressConsentRegister || false;

    /**
     * A list of tags that should refire when the user makes an initial, non opt-out explicit decision on first landing.
     * @name refiringAllowed
     * @type {array}
     * @memberof! tealiumCmpIntegration
     */
    var refiringAllowed = window.tealiumCmpIntegration.refiringAllowed || [];
    // name to use when calling utag.handler.trigger to indicate a consent polling call
    var nameOfConsentPollingEvent = window.tealiumCmpIntegration.nameOfConsentPollingEvent || "tiq_cmp_consent_polling";
    // setTimeout interval in MS - rate to poll for new (explicit) consent decision or correctly formed object
    var consentTimeoutInterval = 250;
    // check for the Tealium Debug cookie, see https://docs.tealium.com/platforms/javascript/debugging/
    var tiqInDebugMode = /utagdb=true/.test(document.cookie);
    // fall back to prod (stops logging) if something goes wrong with the function
    var tealiumEnvironment = getTealiumEnvironment() || "prod";
    /**
     * Profile-specific helper, expected to be provided by utcm/integration (and possibly overridden via Publish Engine). The Group Name for Tealium iQ in the CMP (used to decide if the TMS is allowed to run). Uses a standard name if not provided.
     * @name tiqGroupName
     * @type {string}
     * @memberof! tealiumCmpIntegration
     * @default '_missing_'
     */
    var tiqGroupName = window.tealiumCmpIntegration.tiqGroupName || "_missing_"; // make sure there's no match if it's not set
    /**
     * CMP-specific helper, expected to be provided by utcm/integration. Expects a function that gets the current consent decision from the CMP.
     * @function cmpFetchCurrentConsentDecision
     * @memberof! tealiumCmpIntegration
     * @returns {*} The CMP response to use within other CMP-specific functions
     */
    var cmpFetchCurrentConsentDecision =
        (typeof window.tealiumCmpIntegration.cmpFetchCurrentConsentDecision === "function" &&
            window.tealiumCmpIntegration.cmpFetchCurrentConsentDecision) ||
        function () { };
    /**
     * CMP-specific helper, expected to be provided by utcm/integration. Indicates if the CMP has loaded and returned a well-formed indication of user consent.
     * @function cmpCheckForWellFormedDecision
     * @memberof! tealiumCmpIntegration
     * @param cmpRawOutput the CMP output returned from cmpFetchCurrentConsentDecision
     * @returns {boolean} 'true' if the consent decision is well-formed, otherwise 'false'
     */
    var cmpCheckForWellFormedDecision =
        (typeof window.tealiumCmpIntegration.cmpCheckForWellFormedDecision === "function" &&
            window.tealiumCmpIntegration.cmpCheckForWellFormedDecision) ||
        function () { };
    /**
     * CMP-specific helper, expected to be provided by utcm/integration. Get the current CMP lookup key from the page, to use to find the right map.
     * @returns {string} the ID/key to use for the tag map lookup, defaults to an empty string if none is found
     */
    var cmpFetchCurrentLookupKey =
        (typeof window.tealiumCmpIntegration.cmpFetchCurrentLookupKey === "function" &&
            window.tealiumCmpIntegration.cmpFetchCurrentLookupKey) ||
        function () { };
    /**
     * CMP-specific helper, expected to be provided by utcm/integration. Indicates if the user has made an EXPLICIT decision.
     * @function cmpCheckForExplicitConsentDecision
     * @memberof! tealiumCmpIntegration
     * @param cmpRawOutput the CMP output returned from cmpFetchCurrentConsentDecision
     * @returns {boolean} 'true' if the consent decision is EXPLICIT otherwise 'false'
     */
    var cmpCheckForExplicitConsentDecision =
        (typeof window.tealiumCmpIntegration.cmpCheckForExplicitConsentDecision === "function" &&
            window.tealiumCmpIntegration.cmpCheckForExplicitConsentDecision) ||
        function () { };
    /**
     * CMP-specific helper, expected to be provided by utcm/integration. Indicates if Tealium iQ has permission to run (and fire tags).
     * @function cmpCheckForTiqConsent
     * @memberof! tealiumCmpIntegration
     * @param cmpRawOutput the CMP output returned from cmpFetchCurrentConsentDecision
     * @param tiqGroupName the Group Name designation for Tealium iQ in the CMP
     * @returns {boolean} 'true' if TiQ is allowed to run, otherwise 'false'
     */
    var cmpCheckForTiqConsent =
        (typeof window.tealiumCmpIntegration.cmpCheckForTiqConsent === "function" &&
            window.tealiumCmpIntegration.cmpCheckForTiqConsent) ||
        function () { };
    /**
     * CMP-specific helper, expected to be provided by utcm/integration. Indicates if Tealium iQ has permission to run (and fire tags).
     * @function cmpConvertResponseToGroupList
     * @memberof! tealiumCmpIntegration
     * @param cmpRawOutput the CMP output returned from cmpFetchCurrentConsentDecision
     * @returns {array} a simple list of the group names with permissions to fire, at the desired granularity
     */
    var cmpConvertResponseToGroupList =
        (typeof window.tealiumCmpIntegration.cmpConvertResponseToGroupList === "function" &&
            window.tealiumCmpIntegration.cmpConvertResponseToGroupList) ||
        function () { };
    /**
     * CMP-specific helper, expected to be provided by utcm/integration. Indicates if the CMP is running in opt-in (GDPR-like) or opt-out (CCPA-like) mode
     * @function cmpCheckIfOptInModel
     * @memberof! tealiumCmpIntegration
     * @returns {boolean} true if the CMP is in opt-in mode (like for GDPR), false if opt-out mode (like for CCPA)
     */
    var cmpCheckIfOptInModel =
        (typeof window.tealiumCmpIntegration.cmpCheckIfOptInModel === "function" &&
            window.tealiumCmpIntegration.cmpCheckIfOptInModel) ||
        function () { };
    /**
     * The current version designation
     * @name version
     * @type {string}
     * @private
     * @memberof! tealiumCmpIntegration
     */
    window.tealiumCmpIntegration.version = version;
    /**
     * A [helper function]{@link module:utcm/framework~logger}, to help Tealium iQ users understand and troubleshoot this CMP integration without unneeded logging in production.
     * @name logger
     * @type {function}
     * @private
     * @memberof! tealiumCmpIntegration
     */
    window.tealiumCmpIntegration.logger = logger;
    /**
     * A [helper function]{@link module:utcm/framework~getCurrentConsentDecision} that returns the current [ConsentDecision]{@link ConsentDecision}.
     * @name getCurrentConsentDecision
     * @type {function}
     * @private
     * @memberof! tealiumCmpIntegration
     */
    window.tealiumCmpIntegration.getCurrentConsentDecision = getCurrentConsentDecision;
    /**
     * A [helper function]{@link module:utcm/framework~cmpFetchCurrentLookupKey} that returns the current CMP lookup key (found on the page)
     * @name cmpFetchCurrentLookupKey
     * @type {function}
     * @private
     * @memberof! tealiumCmpIntegration
     */
    window.tealiumCmpIntegration.cmpFetchCurrentLookupKey = cmpFetchCurrentLookupKey;
    /**
     * Records the status of the [noview]{@link https://docs.tealium.com/platforms/javascript/settings/#noview} setting on page load.
     * @name isNoviewSet
     * @type {boolean}
     * @private
     * @memberof! tealiumCmpIntegration
     */
    window.tealiumCmpIntegration.isNoviewSet = window.utag_cfg_ovrd && window.utag_cfg_ovrd.noview === true;
    /**
     * The name to use for the full [ConsentDecision]{@link ConsentDecision} array when adding it to Tealium's b object on each event.
     * @name nameOfFullGroupArray
     * @type {string}
     * @default tci.purposes_with_consent_all
     * @memberof! tealiumCmpIntegration
     */
    window.tealiumCmpIntegration.nameOfFullGroupArray = nameOfFullGroupArray;
    /**
     * The name to use for the [ConsentDecision]{@link ConsentDecision}'s 'type' attribute ('implicit' or 'explicit') when adding it to Tealium's b object on each event.
     * @name nameOfConsentTypeString
     * @type {string}
     * @default tci.consent_type
     * @memberof! tealiumCmpIntegration
     */
    window.tealiumCmpIntegration.nameOfConsentTypeString = nameOfConsentTypeString;
    /**
     * The name to use for the array of not-yet-processed-but-consented groups when adding it to Tealium's b object on each event and in the 'data' property of {@link QueuedEvent QueuedEvent} objects.
     * @name nameOfUnprocessedGroupArray
     * @type {string}
     * @default tci.purposes_with_consent_unprocessed
     * @memberof! tealiumCmpIntegration
     */
    window.tealiumCmpIntegration.nameOfUnprocessedGroupArray = nameOfUnprocessedGroupArray;
    /**
     * The name to use for the array of already-processed consented groups when adding it to Tealium's b object on each event and in the 'data' property of {@link QueuedEvent QueuedEvent} objects.
     * @name nameOfProcessedGroupArray
     * @type {string}
     * @default tci.purposes_with_consent_processed
     * @memberof! tealiumCmpIntegration
     */
    window.tealiumCmpIntegration.nameOfProcessedGroupArray = nameOfProcessedGroupArray;
    /**
     * A queue for any events that Tealium iQ processes with IMPLICIT consent (to allow those events to be re-processed for new Services in the event of an EXPLICIT consent choice by the user).
     * Each element in the queue is a [QueuedEvent]{@link QueuedEvent}
     * @name implicitEventQueue
     * @type {array}
     * @private
     * @memberof! tealiumCmpIntegration
     */
    window.tealiumCmpIntegration.implicitEventQueue = window.tealiumCmpIntegration.implicitEventQueue || [];
    /**
     * A queue for any events that are triggered before Tealium iQ AND the CMP have both loaded.
     * Each element in the queue is a [QueuedEvent]{@link QueuedEvent}
     * @name earlyEventQueue
     * @type {array}
     * @private
     * @memberof! tealiumCmpIntegration
     */
    window.tealiumCmpIntegration.earlyEventQueue = window.tealiumCmpIntegration.earlyEventQueue || [];
    /**
     * A map of CMP groups to arrays of Tealium iQ tag UIDs, an instance of {@link GroupToTagMap GroupToTagMap}. TiQ profile specific, and expected to be provided by Publish Engine (map).
     * @name map
     * @type {object}
     * @memberof! tealiumCmpIntegration
     */
    var map = window.tealiumCmpIntegration.map || {};
    /**
     * A map of Tealium iQ tag UIDs to CMP group assignment, a {@link TagToGroupMap TagToGroupMap}
     * @name tagBasedMap
     * @type {object}
     * @private
     * @memberof! tealiumCmpIntegration
     */
    window.tealiumCmpIntegration.tagBasedMap = generateTagBasedMap();
    /**
     * Allows us to make sure we don't log certain messages more than once, especially useful while polling to avoid overwhelming the user.
     * @function messageNotLoggedYet
     * @param {*} messageId a string or number to uniquely identify a message for the purposes of deduplication
     * @private
     * @returns {boolean} 'true' if the message hasn't been logged yet (and should be logged), otherwise 'false'
     */
    var alreadyLoggedMessageIds = {};
    function messageNotLoggedYet(messageId) {
        var output = false;
        if (typeof alreadyLoggedMessageIds[messageId] === "undefined") {
            alreadyLoggedMessageIds[messageId] = true;
            output = true;
        }
        return output;
    }
    /**
     * Create an instance of {@link ConsentDecision ConsentDecision} based on the specific CMP response
     * @param {array} cmpRawOutput the CMP output returned from cmpFetchCurrentConsentDecision
     * @private
     * @returns {array} an instance of {@link ConsentDecision ConsentDecision}
     */
    function buildConsentDecisionFromRawCmpOutput(cmpRawOutput) {
        var vendorArray = cmpConvertResponseToGroupList(cmpRawOutput) || [];
        var isWellFormed = cmpCheckForWellFormedDecision(cmpRawOutput);
        if (!isWellFormed) {
            vendorArray.type = "missing-well-formed-response";
            return vendorArray;
        }
        var tagBasedMap = generateTagBasedMap();
        // if there is no mapping for the settings id, we need to change the console output
        var currentSettingsIdHasMapping = typeof tagBasedMap === "object" && Object.keys(tagBasedMap).length > 0;
        if (!currentSettingsIdHasMapping) {
            vendorArray.type = "missing-map";
            return vendorArray;
        }
        vendorArray.type = cmpCheckForExplicitConsentDecision(cmpRawOutput) ? "explicit" : "implicit";
        var tiqGroupName = window.tealiumCmpIntegration.tiqGroupName || "_missing_";
        if (cmpCheckForTiqConsent(cmpRawOutput, tiqGroupName) === false) {
            // change the consent type, but leave the array for debugging purposes
            vendorArray.type = "missing-tiq-consent";
        }
        return vendorArray;
    }


    // class that emits consent events as decision change
    class TealiumConsentRegister {
        constructor() {
            this.currentDecision = null;
            this.decisions = [];
        }

        addConsentDecision(decision) {
            // only accept 'implicit' or 'explicit' decisions
            if (!decision || (decision.type !== 'implicit' && decision.type !== 'explicit')) {
                return;
            }
            // don't emit the same decision twice in a row
            if (!this.isNewDecision(this.currentDecision, decision)) {
                return;
            }
            const eventType = this.currentDecision === null ? 'consent_loaded' : 'consent_updated';
            this.currentDecision = decision;
            this.decisions.push(decision);
            const event = new CustomEvent(eventType, { detail: { decision: decision } });
            window.dispatchEvent(event);
        }

        getCurrentDecision() {
            return this.currentDecision;
        }

        getAllDecisions() {
            return this.decisions;
        }

        isNewDecision(desc1, desc2) {
            if (!desc1 || !desc2 || desc1.length !== desc2.length || desc1.type !== desc2.type) return true;

            for (let i = 0; i < desc1.length; i++) {
                if (desc1[i] !== desc2[i]) {
                    return true;
                }
            }
            return false;
        }
    }

    /**
     * The core CMP integration logic, which decides if Tealium iQ should be allowed to run, or if it needs to be stopped until an understandable response that includes permission for Tealium iQ to run is found.
     * @function reactToCmpResponse
     * @param {object} cmpResponse The response from the checkConsents function
     * @access private
     */
    function reactToCmpResponse(cmpResponse) {
        var cmpFound = typeof cmpResponse === "object";
        var foundWellFormedConsentDecision = cmpCheckForWellFormedDecision(cmpResponse);
        var tagBasedMap = generateTagBasedMap();
        var foundMapEntryForActiveSetting = Object.keys(tagBasedMap).length > 0;
        var foundExplicitConsent = cmpCheckForExplicitConsentDecision(cmpResponse);
        var tiqIsAllowedToFire = cmpCheckForTiqConsent(cmpResponse, tiqGroupName);
        var tiqIsLoaded = window.tealiumCmpIntegration.isTiqReady || (window.utag && window.utag.handler && window.utag.handler.iflag === 1);
        var conflictingIntegrations = window.tealiumCmpIntegration.loadRules.hasConflict;
        var noEnforcementRuleApplies = (Object.values(window.tealiumCmpIntegration.loadRules.loadMap)).indexOf(true) === -1;

        var currentDecision = buildConsentDecisionFromRawCmpOutput(cmpResponse);

        // emit consent events for consumption by any client or tool
        try {
            if (!window.tealiumCmpIntegration.suppressConsentRegister) {
                window.tealiumConsentRegister = window.tealiumConsentRegister || new TealiumConsentRegister();
                window.tealiumConsentRegister.addConsentDecision(currentDecision);
            }
        } catch (e) {
            console.warn(e)
        }

        // poll, because we can't rely on CMPs to be able to push decisions to us (and we want to simplify the integrations)
        function checkLater() {
            if (!window.tealiumCmpIntegration.alreadyPolling) {
                window.tealiumCmpIntegration.alreadyPolling = true;
                return window.setTimeout(recheckForCmpAndConsent, consentTimeoutInterval);
            }
        }
        // poll, but only if we're waiting for an explicit decision in an opt-in model
        // or we're still waiting for TiQ or the CMP to be ready
        function checkLaterIfNeeded() {
            if (cmpCheckIfOptInModel() === true) {
                return checkLater();
            }
            if (cmpCheckIfOptInModel() === false && !window.tealiumCmpIntegration.isTiqReady) {
                return checkLater();
            }
        }

        // make sure we set the persistent flag to prevent overpolling
        if (tiqIsLoaded) {
            window.tealiumCmpIntegration.isTiqReady = true;
        }
        if (conflictingIntegrations) {
            /**
             * Conflicting integrations found
             *
             * STOP and fire nothing at all. Do not retry.
             */
            if (messageNotLoggedYet(0)) {
                var message = "Conflicting consent integrations found:\n";
                var loadMap = window.tealiumCmpIntegration.loadRules.loadMap;
                Object.keys(loadMap).forEach(function (key) {
                    if (loadMap[key])
                        message += "\n- " + key
                });
                message += "\n\nStopping TiQ (no cookies set/removed, no tags fired).\n\nNo further polling."
                logger(message);
            }
            stopTiq();
        } else if (noEnforcementRuleApplies) {
            if (messageNotLoggedYet(10))
                logger("Consent Integrations are active on this environment, but none of the enforcement rules apply to this page, and no exemption applies.\n\nStopping TiQ (no cookies set/removed, no tags fired).");
            stopTiq();
        } else if (!cmpFound) {
            /**
             * CASE A1: no CMP found
             *
             * STOP and fire nothing at all
             * RETRY after a delay
             */
            if (messageNotLoggedYet(1))
                logger(
                    "No CMP found on page.\n\nStopping TiQ (no cookies set/removed, no tags fired).\n\nPolling for changes."
                );
            checkLater();
            stopTiq();
        } else if (!foundMapEntryForActiveSetting) {
            /**
             * CASE A7: No map found for the current CMP lookup key
             *
             * STOP and fire nothing at all. Do not retry.
             */
            if (messageNotLoggedYet(2))
                logger(
                    "No map found for current CMP Lookup Key.\n\nStopping TiQ (no cookies set/removed, no tags fired).\n\nNo retries."
                );
            stopTiq();
        } else if (!foundWellFormedConsentDecision) {
            /**
             * CASE A2: CMP found but consent response wasn't well-formed/complete/understandable
             *
             * STOP and fire nothing at all
             * RETRY after a delay
             */
            if (messageNotLoggedYet(3))
                logger(
                    "Found CMP and got response, but didn't understand the response.\n\nStopping TiQ (no cookies set/removed, no tags fired).\n\nPolling for changes."
                );
            checkLater();
            stopTiq();
        } else if (!tiqIsAllowedToFire) {
            /**
             * CASE A3: CMP found and consent response was well-formed, BUT TiQ didn't have an opt-in
             *
             * STOP and fire nothing at all
             * RETRY after a delay
             */
            if (messageNotLoggedYet(4))
                logger(
                    "Found CMP and got well-formed response, but TiQ (window.tealiumCmpIntegration.tiqGroupName, defined as " +
                    window.tealiumCmpIntegration.tiqGroupName +
                    ") isn't allowed to run based on the response.\n\nStopping TiQ (no cookies set/removed, no tags fired).\n\nPolling for changes."
                );
            checkLaterIfNeeded();
            stopTiq();
        } else if (!foundExplicitConsent) {
            /**
             * CASE A4: CMP found AND response was understandable (AND includes an implicit TiQ consent), BUT the user hasn't made an explicit decision yet
             *
             * ALLOW TO LOAD for any 'default opt-in' tags (filter logic in Extension B)
             * RETRY after a delay (in case there's an explicit decision, since implicit decisions usually mean the prompt is displayed)
             */
            if (cmpCheckIfOptInModel() === true) {
                checkLaterIfNeeded();
                if (messageNotLoggedYet(5))
                    logger(
                        "Found CMP and got well-formed IMPLICIT response which includes TiQ.\n\nAllowing certain tags to fire based on IMPLICIT consent.\n\nPolling for changes (opt-in mode)."
                    );
            } else {
                if (messageNotLoggedYet(5))
                    logger(
                        "Found CMP and got well-formed IMPLICIT response which includes TiQ.\n\nAllowing certain tags to fire based on IMPLICIT consent.\n\nNo further polling (opt-out mode)"
                    );
            }
            if (tiqIsLoaded) {
                processEarlyQueue();
            } else {
                checkLaterIfNeeded();
            }
            triggerOrQueue();
        } else if (foundExplicitConsent) {
            /**
             * CASE A5: CMP found AND response was understandable, AND the user has made an explicit consent decision AND TiQ is allowed
             *
             * ALLOW TO LOAD for any opted-in tags (filter logic in Extension B), do not retry.
             */
            if (messageNotLoggedYet(6))
                logger(
                    "Found CMP and got well-formed EXPLICIT response which includes TiQ.\n\nAllowing certain tags to fire based on EXPLICIT consent.\n\nNo further polling."
                );
            processEarlyQueue();
            processImplicitQueue();
            triggerOrQueue();
        } else {
            /**
             * CASE A6: Something went wrong with this extension.
             *
             * STOP and fire nothing at all. Do not retry.
             */
            if (messageNotLoggedYet(7))
                logger(
                    "Something unexpected went wrong.\n\nStopping TiQ (no cookies set/removed, no tags fired).\n\nNo retries."
                );
            stopTiq();
        }
        // if we're in pure monitoring mode, keep polling for changes beyond the first explicit one
        if (!window.tealiumCmpIntegration.suppressConsentRegister && !window.tealiumCmpIntegration.alreadyPolling) {
            window.tealiumCmpIntegration.pollingWouldHaveStopped = true;
            return checkLater();
        }
    }
    /**
     * Override utag.loader.initdata, utag.handler.trigger, utag.handler.RE to allow Tealium iQ Tags to be blocked if the user hasn't consented.
     * @function overrideUtagFunctions
     * @returns {boolean} 'true' if the function was overridden successfully by this request, 'false' if not (because it was already overridden)
     * @access private
     */
    function overrideUtagFunctions() {
        // don't override more than once, assume that if one function has been overridden, both have
        if (window.utag.handler.trigger.toString().indexOf("tealiumCmpIntegration") !== -1) {
            return true;
        }
        // the initial view is handled differently than subsequent events
        // this is safe to to override even if noview is set (because it will never be called in that case)
        window.utag.loader.initdata_old = window.utag.loader.initdata;
        window.utag.loader.initdata = newUtagLoaderInitdata;
        window.utag.handler.trigger_old = window.utag.handler.trigger;
        window.utag.handler.trigger = newUtagHandlerTrigger;
        window.utag.handler.RE_old = window.utag.handler.RE;
        window.utag.handler.RE = newUtagHandlerRE;
        logger("Overrode utag functions!");
        if (window.utag.handler.trigger.toString().indexOf("tealiumCmpIntegration") !== -1) {
            return true;
        }
        return false;
    }

    /**
     * Returns all items from explicit array which are not contained in implicit array
     * @param {array} implicit
     * @param {array} explicit
     * @returns {array}
     * @access private
     */
    function getNewConsents(implicit, explicit) {
        implicit = implicit || [];
        explicit = explicit || [];
        var changes = [];
        for (var i = 0; i < explicit.length; i++) {
            if (implicit.indexOf(explicit[i]) === -1) {
                changes.push(explicit[i]);
            }
        }
        return changes;
    }
    /**
     * Determines if a tag is allowed to fired based on the required consent and the granted consent
     * @param {array} consentedServices a {@link ConsentDecision ConsentDecision}
     * @param {string} assignedPurposesString an comma-delimited string of Purpose IDs.
     * @returns {boolean}
     * @private
     */
    function allPurposesHaveConsent(consentedServices, assignedPurposesString) {
        if (!consentedServices || !assignedPurposesString || typeof assignedPurposesString !== 'string') return false; // return an opt-out in error cases
        var splitPurposeIds = assignedPurposesString.split(',');
        for (var i = 0; i < splitPurposeIds.length; i++) {
            if (consentedServices.indexOf(splitPurposeIds[i]) === -1) return false;
        }
        // all the purposes had consent
        return true;
    }
    /**
     * Determines if a tag should be fired based on the required consent and the previously processed consent
     * @param {array} alreadyProcessedGroups a {@link ConsentDecision ConsentDecision}
     * @param {string} assignedPurposesString an comma-delimited string of Purpose IDs.
     * @returns {boolean}
     * @private
     */
    function allPurposesHaveBeenPreviouslyProcessed(alreadyProcessedGroups, assignedPurposesString) {
        if (!alreadyProcessedGroups || !assignedPurposesString || typeof assignedPurposesString !== 'string') return true; // err toward blocking in error/misconfiguration cases
        var splitPurposeIds = assignedPurposesString.split(',');
        for (var i = 0; i < splitPurposeIds.length; i++) {
            if (alreadyProcessedGroups.indexOf(splitPurposeIds[i]) === -1) return false;
        }
        // all the purposes have already been processed
        return true;
    }
    /**
     * Blocks tags based on consent by manually setting the 'load' and 'send' flags to 0 for any tags that don't have permission to fire.
     * That logic isn't sufficient to block tracking calls with a 'uids' array (which also circumvents load rules), so additional blocking logic is added in the utag.handler.trigger override.
     * @param {object} tagBasedMap a {@link TagToGroupMap TagToGroupMap}
     * @param {object} configObject the current window.utag.loader.cfg object (which is used to control which tags should load/fire)
     * @param {array} consentedServices a {@link ConsentDecision ConsentDecision}
     * @param {array} alreadyProcessedGroups an array of Service Names that have already been processed, to avoid double-firing those tags.
     * @private
     */
    function blockTagsBasedOnConsent(
        tagBasedMap,
        configObject,
        consentedServices,
        alreadyProcessedGroups,
        notProcessedGroups,
        refiringAllowed
    ) {
        // block all tags if the consented services array is missing
        if (Array.isArray(consentedServices) !== true) {
            consentedServices = [];
        }
        tagBasedMap = tagBasedMap || {};
        // if the utag template hasn't been edited, this function won't have been overriden, so we gut it
        // to stop tags from firing
        var utagFunctionsHaveBeenOverridden =
            window.utag.handler.trigger.toString().indexOf("tealiumCmpIntegration") !== -1;
        if (utagFunctionsHaveBeenOverridden !== true) {
            window.utag.handler.trigger = function () {
                if (messageNotLoggedYet(8)) {
                    logger(
                        "Tags have been disabled because the required utag.loader edit hasn't been done successfully and the tealiumCmpIntegration is active."
                    );
                }
            };
            consentedServices = [];
        }

        if (!window.tealiumCmpIntegration.bundledTags) {
            var cfg = window.utag.loader.cfg;
            var tags = Object.keys(cfg);
            window.tealiumCmpIntegration.bundledTags = tags.filter(function (tag) { return cfg[tag].load === 4 });
        }

        var deactivatedTags = [];
        // turn the map into an easier-to-query object
        alreadyProcessedGroups = alreadyProcessedGroups || [];
        var tiqIsAllowed = tiqGroupName && consentedServices.indexOf(tiqGroupName) !== -1;
        var allTagUids = Object.keys(configObject);
        var assignedPurposeIds;
        var isAllowed;

        // deactivate tags that aren't mapped and consented
        for (var i = 0; i < allTagUids.length; i++) {
            isAllowed = false; // assume no consent
            assignedPurposeIds = tagBasedMap[allTagUids[i]] || [];
            if (assignedPurposeIds) {
                // only fire if TiQ and the tag is allowed AND (it hasn't already fired OR it's supposed to refire when decisions change)
                isAllowed =
                    tiqIsAllowed && // TiQ is allowed AND
                    allPurposesHaveConsent(consentedServices, assignedPurposeIds) && // all purposes for this tag have consent AND
                    (!allPurposesHaveBeenPreviouslyProcessed(alreadyProcessedGroups, assignedPurposeIds) || // (tag has not yet fired OR
                        (notProcessedGroups.length > 0 && refiringAllowed.indexOf(Number(allTagUids[i])) !== -1)); // tag is allowed to refire)
            }
            if (isAllowed === true) {
                // should fire - has consent and load rules are met
                configObject[allTagUids[i]].consent = 1;
            } else {
                configObject[allTagUids[i]].load = 0;
                configObject[allTagUids[i]].send = 0;
                configObject[allTagUids[i]].consent = 0;
                deactivatedTags.push(allTagUids[i]);
            }
        }
        if (messageNotLoggedYet(9)) {
            logger(
                "Blocked tags: " +
                JSON.stringify(deactivatedTags, null, 2) +
                (tiqIsAllowed ? "" : "\n\nAll tags blocked because Tealium iQ isn't allowed to fire.")
            );
        }
        return configObject;
    }
    /**
     * An overridden version of the Tealium iQ function utag.handler.RE.
     * @function newUtagHandlerRE
     * @param {*} a can be an object or a string
     * @param {*} b
     * @param {*} c
     * @access private
     */
    function newUtagHandlerRE(a, b, c) {
        if (c == "alr") {
            var tagBasedMap = generateTagBasedMap();
            // recheck
            var currentlyAllowedVendors = getCurrentConsentDecision();
            var alreadyProcessed = b[nameOfImplicitQueueMarker] === 1 ? window.tealiumCmpIntegration.implicitServices : []; // use the previously processed consent if appropriate
            var notProcessed = getNewConsents(alreadyProcessed, currentlyAllowedVendors);
            // Add the current ConsentDecision information (allowed Services and consent type) to the UDO for possible use in extensions
            b[nameOfFullGroupArray] = currentlyAllowedVendors;
            b[nameOfConsentTypeString] = currentlyAllowedVendors && currentlyAllowedVendors.type;
            b[nameOfUnprocessedGroupArray] = notProcessed;
            b[nameOfProcessedGroupArray] = alreadyProcessed;
            logger(
                "Called block logic:\n\nAllowed: " +
                JSON.stringify(currentlyAllowedVendors, null, 2) +
                "\n\nAlready processed: " +
                (alreadyProcessed ? JSON.stringify(alreadyProcessed, null, 2) : "(none)")
            );
            logger(
                "Map:\n\n" +
                JSON.stringify(map, null, 2) +
                "\n\nActive CMP Lookup Key: " +
                cmpFetchCurrentLookupKey() +
                "\n\nMap has entry for current settingsId: " +
                (typeof map[cmpFetchCurrentLookupKey()] === "object" ? "true" : "false") +
                "\n\nTag-based map for the active key: " +
                JSON.stringify(tagBasedMap, null, 2) +
                "\n\nTags configured to refire: " +
                JSON.stringify(refiringAllowed.map(tag => String(tag)), null, 2)
            );
            logger(
                "Consent confirmed: " +
                currentlyAllowedVendors.type +
                " : " +
                JSON.stringify(currentlyAllowedVendors, null, 2)
            );
            var newCfg = blockTagsBasedOnConsent(
                tagBasedMap,
                window.utag.loader.cfg,
                currentlyAllowedVendors,
                alreadyProcessed,
                notProcessed,
                refiringAllowed
            );
            window.utag.loader.cfg = newCfg;
        }
        var r = window.utag.handler.RE_old(a, b, c);
        return r;
    }
    /**
     * An overridden version of the Tealium iQ function utag.loader.initdata.
     * Calls the original function, respects possible noview settings, rechecks the user consent, and calls queueEventWithoutFiringImplicitServices
     * if only an IMPLICIT consent is found (after recording the IMPLICIT services, to avoid double-firing).
     * That same event can then be re-processed for any new Services if an EXPLICIT consent decision later made.
     * @function newUtagLoaderInitdata
     * @access private
     */
    function newUtagLoaderInitdata() {
        window.utag.loader.initdata_old();
        // make sure we don't queue this initial page load twice, and respect the configured noview setting
        if (!window.tealiumCmpIntegration.isNoviewSet && !window.tealiumCmpIntegration.alreadyFiredInitialViewEvent) {
            var consentedServices = getCurrentConsentDecision();
            if (consentedServices.type === "missing-well-formed-response") {
                return;
            }
            window.tealiumCmpIntegration.alreadyFiredInitialViewEvent = true;
            if (consentedServices.type === "implicit") {
                window.tealiumCmpIntegration.implicitServices = consentedServices;
                var viewEvent = {
                    event: "view",
                    data: window.utag.handler.C(window.utag.data),
                };
                // store the original event and get the ID back
                viewEvent.data[nameOfEventIdString] = storeOriginalEvent(viewEvent);
                // we don't need to fire implicit services in this case, because TiQ's loading process will fire them
                queueEventWithoutFiringImplicitServices(viewEvent);
            }
        }
    }
    /**
     * Refresh [tealiumCmpIntegration.tagBasedMap]{@link tealiumCmpIntegration.tagBasedMap} and return that new map, helps smooth out any timing issues between CMP and Tealium iQ load.
     * @function generateTagBasedMap
     * @returns a [TagToGroupMap]{@link TagToGroupMap}
     * @access private
     */
    function generateTagBasedMap() {
        var tagBasedMap = getTagBasedMap(map);
        window.tealiumCmpIntegration.tagBasedMap = tagBasedMap;
        return tagBasedMap;
    }
    /**
     * Tealium iQ's utag.handler.trigger normally causes tags to fire. For this integration, we override that function to support blocking tags without consent.
     * @function newUtagHandlerTrigger
     * @param {*} a can be an object or a string
     * @param {*} b
     * @param {*} c
     * @access private
     */
    function newUtagHandlerTrigger(a, b, c) {
        /**
         * Trigger CASES (utag.handler.trigger override)
         *
         * We need to queue the events if we only have implicit consent, to allow a selective retrigger if/when we get an explicit decision.
         */
        var isPureConsentEvent = a === nameOfConsentPollingEvent && !b && !c;
        var isNoviewSet = window.tealiumCmpIntegration.isNoviewSet || true; // assume noview if something went wrong with the global, to avoid firing tracking in error
        var consentedServices = getCurrentConsentDecision();
        var consentType = (consentedServices && consentedServices.type) || "none";
        var isCmpReady = consentType === "implicit" || consentType === "explicit";
        var isTealiumReady = window.tealiumCmpIntegration.isTiqReady || (window.utag && window.utag.handler && window.utag.handler.iflag === 1) || (window.utag && window.utag.PINITCalled === true);
        // save this to avoid polling too much if something goes wrong with the iflag after initial load
        if (isTealiumReady) {
            window.tealiumCmpIntegration.isTiqReady = true;
        }
        if (!isPureConsentEvent) {
            logger("utag.handler.trigger called with:\n\n" + JSON.stringify(arguments, null, 2));
            b = b || {};
            // use the existing id or store the original event and get the ID back
            b[nameOfEventIdString] = b[nameOfEventIdString] || storeOriginalEvent(a, b, c);
        }
        if (!isCmpReady && !isTealiumReady) {
            consentedServices.type = "tealium-and-cmp-loading";
            logger("Waiting for CMP and Tealium to be ready, queueing early event.");
            queueEarlyEvent(a, b, c);
            return false;
        } else if (!isCmpReady) {
            consentedServices.type = "cmp-loading";
            logger("CMP is still loading, queueing early event");
            queueEarlyEvent(a, b, c);
            return false;
        } else if (!isTealiumReady) {
            consentedServices.type = "tealium-still-loading";
            logger("Tealium iQ is still loading, queueing early event");
            queueEarlyEvent(a, b, c);
            return false;
        }
        // if an array of tagUids is passed, that forces them to fire regardless of load rules
        // or consent, so we need to filter that array before allowing it to be processed
        var hasTagUidArray = c && typeof c === "object" && c.uids && window.utag.ut.typeOf(c.uids) === "array";
        var uidMap = generateTagBasedMap();
        var allowedTagUids = [];
        var blockedTagUids = [];
        var assignedPurposeIds;
        var tagUid;
        var hasConsent;
        if (hasTagUidArray) {
            for (var i = 0; i < c.uids.length; i++) {
                tagUid = c.uids[i];
                assignedPurposeIds = uidMap[tagUid] || "(missing)";
                hasConsent = utag.loader.cfg[tagUid] && utag.loader.cfg[tagUid].consent === 1;
                // only push consented services into the new array
                if (hasConsent) {
                    allowedTagUids.push(tagUid);
                } else {
                    blockedTagUids.push(tagUid);
                }
            }
            c.originalUids = c.uids.slice(); // make a shallow copy
            c.uids = allowedTagUids.slice();
            c.blockedTagUids = blockedTagUids.slice();
            // replace the original with the filtered array (can also be empty, if none of them were allowed)
            logger(
                "Call included tagUid array:\n\n" +
                JSON.stringify(c.originalUids) +
                "\n\nwhich was replaced by the filtered version (after consent and refire considerations):\n\n" +
                JSON.stringify(c.uids)
            );
        }
        if (consentType === "explicit") {
            /**
             * CASE T2: expected globals are populated, consent is EXPLICIT
             *
             * FIRE allowed tags (explicit)
             * utag.handler.trigger override PROCESSES the queue, which will include any queued events from CASE A4, making sure not to re-fire any default
             * opt-in tags that were already fired for the queued events
             */
            // make sure TiQ loads
            processEarlyQueue();
            processImplicitQueue();
            triggerTiqLoad();
            // fire the current event if it's not just a polling event
            if (!isPureConsentEvent) {
                return window.utag.handler.trigger_old(a, b, c);
            }
        } else if (consentType === "implicit") {
            /**
             * CASE T3: expected globals are populated, consent is IMPLICIT
             *
             * FIRE allowed tags (implicit)
             * utag.handler.trigger override KEEPS a queue/record that includes
             *  - the event(s) that were processed based on implicit consent
             *  - which tags were allowed to process each event (are set to implicit opt-in)
             */
            processEarlyQueue();
            // fire the initial view if appropriate, and queue it
            triggerTiqLoad();
            window.tealiumCmpIntegration.implicitServices = consentedServices;
            // queue the initial 'view' on pageload if appropriate
            if (!isNoviewSet && isTealiumReady && !window.tealiumCmpIntegration.alreadyFiredInitialViewEvent) {
                window.tealiumCmpIntegration.alreadyFiredInitialViewEvent = true;
                queueEventAndFireImplicitServices("view", window.utag.handler.C(window.utag.data));
            }
            // queue the current event if it exists (and this isn't just consent polling)
            if (!isPureConsentEvent) {
                return queueEventAndFireImplicitServices(a, b, c);
            }
        } else if (consentType === "missing-map") {
            logger(
                "Something went wrong - all tags were blocked because no consent map was found for the active setting ID."
            );
            return false;
        } else if (consentType === "missing-tiq-consent") {
            logger(
                'Something went wrong - all tags were blocked because no consent was found for "' +
                tiqGroupName +
                '", configured Tealium iQ name.\n\nConsent found: ' +
                JSON.stringify(consentedServices, null, 2)
            );
            return false;
        } else {
            /**
             * CASE T1: expected variables not populated (misconfiguration/error case)
             *
             * STOP and fire nothing at all. Do not retry or queue the event.
             */
            logger("Something went wrong - all tags were blocked because the consent response was not understood.");
            return false;
        }
    }
    var dequeuingInterval = 150;
    /**
     * Process any queued tracking events from [the early event queue]{@link tealiumCmpIntegration.earlyEventQueue} (can include pageviews) for any currently-consented Services.
     * Intended to be called first understandable implicit consent.
     * @function processEarlyQueue
     * @access private
     */
    function processEarlyQueue() {
        if (window.tealiumCmpIntegration.alreadyProcessingEarlyQueue !== true) {  // don't process this queue more than once, it can mess with the event order
            window.tealiumCmpIntegration.earlyEventQueue = window.tealiumCmpIntegration.earlyEventQueue || [];
            var count = 1;
            var trackCallGenerator = function (event) {
                return function () {
                    window.utag.track(event);
                };
            };
            while (window.tealiumCmpIntegration.earlyEventQueue.length > 0) {
                // process past events
                window.tealiumCmpIntegration.alreadyProcessingEarlyQueue = true;
                var queuedEvent = window.tealiumCmpIntegration.earlyEventQueue.shift();
                queuedEvent.data[nameOfProcessedGroupArray] = []; // nothing will have been fired at this point, because this is the early queue
                logger(
                    "Processing queued early event for currently consented tags: " + JSON.stringify(queuedEvent, null, 2)
                );
                var trackCall = trackCallGenerator(queuedEvent);
                window.setTimeout(trackCall, count * dequeuingInterval);
                count++;
            }
        }
    }
    /**
     * Process any queued tracking events from [the global queue]{@link tealiumCmpIntegration.implicitEventQueue} (can include pageviews) for any newly-consented Services.
     * Intended to be called on new EXPLICIT consent decision - queued events have already had IMPLICTLY consented tags fired, so those need to be excluded.
     * @function processImplicitQueue
     * @access private
     */
    function processImplicitQueue() {
        var count = 1;
        var trackCallGenerator = function (event) {
            return function () {
                // use the original event instead of the one that's already had the payload altered by extensions, but use
                // the latest the consent integrations parameters to ensure proper processing
                var originalEventCopy = JSON.parse(JSON.stringify(window.tealiumCmpIntegration.originalEvents[event.data[nameOfEventIdString]])); // copy the object
                originalEventCopy.data[nameOfImplicitQueueMarker] = 1;
                return window.utag.track(originalEventCopy);
            };
        };
        var alreadyLogged = false;
        if (window.tealiumCmpIntegration.alreadyProcessingImplicitQueue !== true) { // don't process this queue more than once, it can mess with the event order
            window.tealiumCmpIntegration.implicitEventQueue = window.tealiumCmpIntegration.implicitEventQueue || [];
            while (window.tealiumCmpIntegration.implicitEventQueue.length > 0) {
                if (!alreadyLogged) {
                    alreadyLogged = true;
                    logger(
                        "Explicit consent tracking request received - processing past implicitly tracked events (" +
                        window.tealiumCmpIntegration.implicitEventQueue.length +
                        ") for any new explicit tags."
                    );
                }
                // process past events
                window.tealiumCmpIntegration.alreadyProcessingImplicitQueue = true;
                var queuedEvent = window.tealiumCmpIntegration.implicitEventQueue.shift();
                logger("Triggering event for explicitly-consented tags: " + JSON.stringify(queuedEvent));
                var trackCall = trackCallGenerator(queuedEvent);
                window.setTimeout(trackCall, count * dequeuingInterval);
                count++;
            }
        }
    }
    /**
     * Queue a [tracking event]{@link QueuedEvent} for later reference, to avoid double-executing extensions. Does not fire tags.
     * Intended to be called for all incoming events, to preserve the original payloads for later replay.
     * @function storeOriginalEvent
     * @param {*} a the 'a' argument from utag.handler.trigger
     * @param {*} b the 'b' argument from utag.handler.trigger
     * @param {*} c the 'c' argument from utag.handler.trigger
     * @returns the event_id to be used for internal lookups when dequeuing (to avoid having extensions process the same payload twice)
     * @access private
     */
    function storeOriginalEvent(a, b, c) {
        a = a || {};
        // make a copy, in case shared objects are used (like utag_data, or a similar global) - snapshot those
        if (typeof b === "object") {
            b = JSON.parse(JSON.stringify(b));
        }
        // convert to a more standard format
        if (typeof a === "string") {
            a = { event: a, data: b || {}, cfg: c };
        }
        // nothing will be allowed to fire
        var event_id = String(Date.now()) + String(Math.round(Date.now() * Math.random() * 10000));
        a.data[nameOfEventIdString] = event_id;
        window.tealiumCmpIntegration.originalEvents = window.tealiumCmpIntegration.originalEvents || {};
        window.tealiumCmpIntegration.originalEvents[event_id] = a;
        logger("Stored original event " + event_id + "!");
        return event_id;
    }
    /**
     * Queue a [tracking event]{@link QueuedEvent} in [the early queue]{@link tealiumCmpIntegration.earlyEventQueue}, without firing any tags.
     * Intended to be called for events that triggered before we get an understandable response from the CMP.
     * @function queueEarlyEvent
     * @param {*} a the 'a' argument from utag.handler.trigger
     * @param {*} b the 'b' argument from utag.handler.trigger
     * @param {*} c the 'c' argument from utag.handler.trigger
     * @access private
     */
    function queueEarlyEvent(a, b, c) {
        a = a || {};
        // make a copy, in case shared objects are used (like utag_data, or a similar global) - snapshot those
        if (typeof b === "object") {
            b = JSON.parse(JSON.stringify(b));
        }
        // convert to a more standard format with our own control object
        if (typeof a === "string") {
            a = { event: a, data: b || {}, cfg: c };
        }
        a.data[nameOfEventIdString] = a.data[nameOfEventIdString] || storeOriginalEvent(a, b, c);  // use the existing id or store the original event and get the ID back

        window.tealiumCmpIntegration.earlyEventQueue = window.tealiumCmpIntegration.earlyEventQueue || [];
        window.tealiumCmpIntegration.earlyEventQueue.push(a);
        logger("Queued early event!");
    }
    /**
     * Queue a [tracking event]{@link QueuedEvent} in [the global queue]{@link tealiumCmpIntegration.implicitEventQueue}, without firing any implictly consented Services.
     * Intended to be called for the initial pageview on load, since the load process will have already fired the implicit services.
     * @function queueEventWithoutFiringImplicitServices
     * @param {*} a the 'a' argument from utag.handler.trigger
     * @param {*} b the 'b' argument from utag.handler.trigger
     * @param {*} c the 'c' argument from utag.handler.trigger
     * @access private
     */
    function queueEventWithoutFiringImplicitServices(a, b, c) {
        a = a || {};
        // make a copy, in case shared objects are used (like utag_data, or a similar global) - snapshot those
        if (typeof b === "object") {
            b = JSON.parse(JSON.stringify(b));
        }
        // convert to a more standard format with a control object for the integrations
        if (typeof a === "string") {
            a = { event: a, data: b || {}, cfg: c };
        }

        a.data[nameOfEventIdString] = a.data[nameOfEventIdString] || storeOriginalEvent(a, b, c);  // use the existing id or store the original event and get the ID back

        // if there's a tagUid array, don't queue the already-fired tags unless they're allowed to refire - instead, swap that with any blocked tags
        var newUids;
        if (a && a.cfg && window.utag.ut.typeOf(a.cfg.uids) === "array") {
            // anything blocked previously (to give it another chance with new consent)
            newUids = a.cfg.blockedTagUids.slice();
            // add any tags that were originally in the uid array AND have been marked to refire on both IMPLICIT and EXPLICIT consent decisions (like Tealium Collect)
            // as long as there are newly consented groups and it's not already in the array
            for (var i = 0; i < refiringAllowed.length; i++) {
                if (
                    a.cfg.originalUids &&
                    a.cfg.originalUids.indexOf(refiringAllowed[i]) !== -1 &&
                    newUids.indexOf(refiringAllowed[i]) === -1 &&
                    (b[nameOfUnprocessedGroupArray] && b[nameOfUnprocessedGroupArray].length > 0)
                ) {
                    newUids.push(refiringAllowed[i]);
                }
            }
            a.cfg.uids = newUids;
        }
        delete a.data[nameOfProcessedGroupArray];
        delete a.data[nameOfFullGroupArray];
        delete a.data[nameOfUnprocessedGroupArray];
        window.tealiumCmpIntegration.implicitEventQueue = window.tealiumCmpIntegration.implicitEventQueue || [];
        // only queue if there's a possiblity that we'll reprocess (only in the opt-in model)
        if (window.tealiumCmpIntegration.cmpCheckIfOptInModel()) {
            window.tealiumCmpIntegration.implicitEventQueue.push(a);
        }
    }
    /**
     * Queue a [tracking event]{@link QueuedEvent} in [the global queue]{@link tealiumCmpIntegration~implicitEventQueue}, without firing any implicitly consented Services.
     * Intended to be called for all events other than the initial page load.
     * @function queueEventAndFireImplicitServices
     * @param {*} a the 'a' argument from utag.handler.trigger
     * @param {*} b the 'b' argument from utag.handler.trigger
     * @param {*} c the 'c' argument from utag.handler.trigger
     * @access private
     */
    function queueEventAndFireImplicitServices(a, b, c) {
        // fire the implicit tags
        window.utag.handler.trigger_old(a, b, c);
        logger("Implicit consent tracking request fired (or queued, if utag hasn't loaded).");
        return queueEventWithoutFiringImplicitServices(a, b, c);
    }
    /**
     * Generate a {@link TagToGroupMap TagToGroupMap} based on a {@link GroupToTagMap GroupToTagMap}
     * @function getTagBasedMap
     * @param {object} map a {@link GroupToTagMap GroupToTagMap} object
     * @return {object} a {@link TagToGroupMap TagToGroupMap}
     * @access private
     */
    function getTagBasedMap(map) {
        // generate a lookup based on the tagUid
        if (typeof map !== "object") return {};
        var settingsId = cmpFetchCurrentLookupKey() || "";
        if (typeof settingsId !== "string" || settingsId === "") return {};
        var settingSpecificMap = map[settingsId] || {};
        var purposeIds = Object.keys(settingSpecificMap);
        var uidMap = {};
        for (var i = 0; i < purposeIds.length; i++) {
            for (var j = 0; j < settingSpecificMap[purposeIds[i]].length; j++) {
                uidMap[settingSpecificMap[purposeIds[i]][j]] = uidMap[settingSpecificMap[purposeIds[i]][j]] || []
                uidMap[settingSpecificMap[purposeIds[i]][j]].push(purposeIds[i]);
            }
        }
        // convert from arrays of purposes to strings
        Object.keys(uidMap).forEach((tag) => {
            uidMap[tag] = uidMap[tag].join(',')
        })
        return uidMap;
    }
    /**
     * Trigger the core logic with an up-to-date {@link ConsentDecision ConsentDecision}
     * @function recheckForCmpAndConsent
     * @access private
     */
    function recheckForCmpAndConsent() {
        var newConsentResponse = cmpFetchCurrentConsentDecision();
        window.tealiumCmpIntegration.alreadyPolling = false; // reset the flag
        reactToCmpResponse(newConsentResponse);
    }
    /**
     * Get the current consent decision from the CMP for the active Setting
     * @function getCurrentConsentDecision
     * @returns a {@link ConsentDecision ConsentDecision}
     * @access private
     */
    function getCurrentConsentDecision() {
        var freshConsent = cmpFetchCurrentConsentDecision();
        return buildConsentDecisionFromRawCmpOutput(freshConsent);
    }
    /**
     *  A conditional logging function - we can't use utag.DB directly because some of our logic needs to be preloader, but we can mimic the same logic so that our logging only displays when TiQ is in debug mode and/or not in Prod, or is explicitly forced.
     * @function logger
     * @private
     * @param {string} message the message to be conditionally shown
     * @param {boolean} showOutsideDebugMode if 'true', forces the message to shown outside of debug mode, except on Prod
     */
    function logger(message, showOutsideDebugMode) {
        if (typeof tealiumEnvironment === "undefined" || tealiumEnvironment === "prod") {
            // don't allow anything outside of debug mode on prod (disable this flag)
            showOutsideDebugMode = false;
        }
        if (showOutsideDebugMode || tiqInDebugMode) {
            message = "\n" + message + "\n";
            var formattedArr = [];
            formattedArr.push("****************");
            var messageArr = message.split("\n");
            messageArr.forEach(function (messageLine) {
                formattedArr.push("*  " + messageLine);
            });
            formattedArr.push("****************");
            var outputString = formattedArr.join("\n");
            console.log(outputString);
        }
    }
    /**
     * Stops Tealium iQ from loading (the TMS will not load tags or set a cookie if this function is called in Pre Loader), using the {@link https://docs.tealium.com/platforms/javascript/settings/#noload noload} setting
     * @function stopTiq
     * @access private
     */
    function stopTiq() {
        window.utag_cfg_ovrd = window.utag_cfg_ovrd || {};
        window.utag_cfg_ovrd.noload = true;
    }
    /**
     * Allows TiQ to finish loading, intended to be called when a well-formed consent response is received, and that response allows Tealium iQ to run.
     * Works by setting {@link https://docs.tealium.com/platforms/javascript/settings/#noload noload} to 'false' and calling Tealium iQ's utag.loader.PINIT method.
     * If noload was 'true' and this function runs it must've been set to true by our own {@link module:utcm/framework~stopTiq stopTiq} function, because otherwise Tealium iQ wouldn't have been allowed to load/poll in the first place.
     * @function triggerTiqLoad
     * @access private
     * @returns {boolean} 'true' if Tealium iQ was successfully triggered, 'false' if it wasn't triggered because it's already initiated
     */
    function triggerTiqLoad() {
        // if the CMP is ready on the first request, TiQ won't have loaded yet at all - let it load naturally
        if (!(window.utag && window.utag.loader && window.utag.loader.PINIT)) {
            return true;
        }
        // if TiQ has already loaded but these flags aren't truthy, we've interrupted the load and should retrigger it
        // initial load / view (noview logic handled in utag.handler.trigger function itself)
        if (!window.utag.handler || !window.utag.handler.iflag) {
            // we don't need to reload actually, just allow it to finish loading
            window.utag.cfg.noload = false; // safe because this code only runs if it was set to false originally
            if (!window.utag.PINITCalled) {
                // calling PINIT more than once causes issues in some edge cases
                // unset this now, at the last second, to prevent DOM Ready from setting cookies with RDses previously but allow them to be set now
                window.utag.loader.rd_flag = undefined;
                window.utag.loader.PINIT();
                // ensure bundled tags that are both prioritized and implicitly consented fire correctly
                for (var i in window.utag.loader.GV(window.utag.loader.cfg)) {
                    var tag = window.utag.loader.cfg[i];
                    if (tag.load === 4 && tag.wait === 0) {
                        window.utag.loader.LOAD(i);
                    }
                }
                window.utag.PINITCalled = true;
            }
            return true;
        }
        // already loaded
        return false;
    }
    /**
     * If Tealium iQ hasn't loaded, load it (calling utag.handler.trigger in the process), otherwise call utag.handler.trigger.
     * @function triggerOrQueue
     * @access private
     */
    function triggerOrQueue() {
        var successfullyTriggeredLoadIfNeeded = triggerTiqLoad();
        if (!successfullyTriggeredLoadIfNeeded) {
            // explicit consent from polling, but load has already been triggered
            return window.utag.handler.trigger(nameOfConsentPollingEvent);
        }
    }
    /**
     * Get the the current Tealium iQ environment.
     * Since this runs in Pre Loader, it needs to use regex to recognize the utag.js file in the DOM and read the environment from the file name (there are no utag functions or objects at this point in the load).
     * NOTE: This doesn't work correctly when using the the Environment Switcher (because the original script is added to the DOM instead of the new one, and the 307 redirect that's used to pull the new file(s) only changes the response, not the script element itself).
     * If you're using the Environment Switcher on Prod and would like to see console output, set the [debug cookie]{@link https://docs.tealium.com/platforms/javascript/debugging/}.
     * @function getTealiumEnvironment
     * @access private
     * @returns {string}
     */
    function getTealiumEnvironment() {
        var allScripts = document.getElementsByTagName("script");
        var re = /\/([^/]*)\/utag\.js(\?.*)*$/;
        for (var i = 0; i < allScripts.length; i++) {
            var result = re.exec(allScripts[i].src); // can be null
            if (result && result[1]) {
                // [1] is the result of the match
                return result[1];
            }
        }
        return "prod"; // default to guessing we're in prod, just in case we're actually in prod (to avoid logging in Prod)
    }
    /******************************************** Module entry point below ********************************************/
    // if noload is set to 'true', don't interfere, just return to exit this function and allow that setting to stop TiQ load as usual.
    if (window.utag_cfg_ovrd && window.utag_cfg_ovrd.noload === true) return false;
    logger(
        "TiQ CMP integration active: " +
        window.tealiumCmpIntegration.cmpName +
        (tiqInDebugMode
            ? "\n\nDEBUGGING TIP: Use /SENDING|\\*\\*\\*\\*/ in the browser console as the 'filter' to show only CMP and tag send notifications."
            : "\n\nActivate TiQ Debug Mode for more details: https://docs.tealium.com/platforms/javascript/debugging/")
    );
    overrideUtagFunctions();
    // FIX for DOM Ready extension conditions (like for Events) in case a noload timing condition is hit
    var data = window.utag.loader.GV(window.utag_data);
    window.utag.cl = {
        "_all_": 1
    };
    window.utag.loader.rd_flag = 1;
    window.utag.loader.RD(data);
    window.utag.loader.loadrules(data);
    window.utag.cl = undefined;
    // leave this set to 1 to prevent DOM Ready from setting cookies with RDses
    // window.utag.loader.rd_flag = undefined;
    var cmpResponse = cmpFetchCurrentConsentDecision();
    reactToCmpResponse(cmpResponse);
})(window);
/*********************************** Document key data structures below for clarity ***********************************/
/**
 * An array of CMP group names that have permission to run.
 * Also includes a 'type' property that indicates whether the consent decision is IMPLICIT or EXPLICT.
 * @static
 * @type {array}
 * @name ConsentDecision
 * @memberof! <global>
 * @property {string} type the type of consent, will be either 'implicit' or 'explicit'
 * @example
var exampleConsentDecision = window.tealiumCmpIntegration.getCurrentConsentDecision()
JSON.stringify(exampleConsentDecision)
// ["C0001","C0002","C0003"]
exampleConsentDecision.type
// "explicit"
exampleConsentDecision.length
// 3
 */
/**
 * Assigns Tealium iQ Tags to Purpose IDs. Each purpose can be associated with multiple tags, and each tag can only be assigned to multiple purposes.
 * The keys for the main object are the configuration ID from the CMP (Vendor Id), inside that are key/value pairs where the key is a Purpose ID (granularity is flexible), and the value is an array of TagUIDs from Tealium iQ.
 * This needs to be provided as per the example below, in [tealiumCmpIntegration.map]{@link namespace:tealiumCmpIntegration~map}.
 * @static
 * @type {object}
 * @name GroupToTagMap
 * @memberof! <global>
 * @example
window.tealiumCmpIntegration = window.tealiumCmpIntegration || {}
window.tealiumCmpIntegration.map = {
    "b38364e4-b2c4-4349-8e4e-48cf28a35db8": {
        "C0004": [
            "17",
            "18",
            "19",
            "20"
        ],
        "C0001": [
            "21",
            "22",
            "14",
            "20"
        ],
        "C0002": [
            "12",
            "20",
            "13",
            "19"
        ],
        "C0003": [
            "13",
            "14",
            "15",
            "16",
            "20"
        ]
    }
}
 */
/**
 * A simple lookup, with Tealium iQ tag UIDs as keys and the Purpose IDs as values. Each purpose can be associated with multiple tags, and each tag can be mapped to multiple purposes.
 * The example is based on the {@link GroupToTagMap GroupToTagMap} example, where the CMP Lookup Key (a Usercentrics Settings ID, in this case) on the active page is 'b38364e4-b2c4-4349-8e4e-48cf28a35db8'.
 * This object is automatically generated by the [getTagBasedMap]{@link module:utcm/framework~getTagBasedMap} method, and made available globally in [tealiumCmpIntegration.tagBasedMap]{@link tealiumCmpIntegration~tagBasedMap} for debugging and use within extensions.
 * @static
 * @type {object}
 * @name TagToGroupMap
 * @memberof! <global>
 * @example
{
    "12": "C0002",
    "13": "C0002,C0003",
    "14": "C0001,C0003",
    "15": "C0003",
    "16": "C0003",
    "17": "C0004",
    "18": "C0004",
    "19": "C0004,C0002",
    "20": "C0004,C0001,C0002,C0003",
    "21": "C0001",
    "22": "C0001"
}
 */
/**
 * An object from the [implicitEventQueue]{@link tealiumCmpIntegration.implicitEventQueue} or [earlyEventQueue]{@link tealiumCmpIntegration.earlyEventQueue}, which represents a Tealium iQ tracking event that's been processed based on an IMPLICIT [ConsentDecision]{@link ConsentDecision}
 * Heavily based on the argument passed to [utag.track]{@link https://community.tealiumiq.com/t5/Tealium-iQ-Tag-Management/utag-track-method/td-p/24578}, since it's designed to be processed by that method.
 * Initial pageviews (handled in the [utag.loader.initdata override]{@link module:utcm/framework~newUtagLoaderInitdata}) will NOT have metadata like cookies, qps, etc - utag.track calls (handled in the [utag.handler.trigger override]{@link module:utcm/framework~newUtagHandlerTrigger}) will. That's a byproduct of using utag.handler.trigger, which is later in the load - those metadata will be re-read when the queue is processed, and since this queue isn't persisted between pages, it should be fine like that - the only strange behavior will be that any metadata that aren't present on re-read will still be present after the re-read - only values that are still present will be replaced with new values.
 * An alternative approach could be to manually remove 'cp.\*', 'dom.\*', 'ut.\*', 'qp.\*', 'meta.\*' and possibly 'tealium_\*' (except 'tealium_event') from the 'data' object before queueing - that hasn't been done so far.
 * @static
 * @type {object}
 * @name QueuedEvent
 * @memberof! <global>
 * @property {string} event the type of tracking event, generally 'view' for pageviews or 'link' for other events
 * @property {object} data the Universal Data Object associated with the event (from utag_data or the b object)
 * @property {object} cfg an optional configuration object that can have a 'cb' property (for a callback function) and a 'uids' array, which is a list of tag UIDs that should be triggered by the event, regardless of whether load rules are met.
 * @example
{
    "event": "view",
    "data": {
        "cp.utag_main_v_id": "0180d6afbfe5001fb3c58332996b05079004c07100fb8",
        "cp.utag_main__sn": "1",
        "cp.utag_main__se": "5",
        "cp.utag_main__ss": "0",
        "cp.utag_main__st": "1652872155220",
        "cp.utag_main_ses_id": "1652869283813",
        "cp.utag_main__pn": "3",
        "cp.utagdb": "true",
        "dom.referrer": "",
        "dom.title": "Usercentrics v2 Test",
        "dom.domain": "solutions.tealium.net",
        "dom.query_string": "",
        "dom.hash": "",
        "dom.url": "https://solutions.tealium.net/hosted/usercentrics-v2/test-page-standard.html",
        "dom.pathname": "/hosted/usercentrics-v2/test-page-standard.html",
        "dom.viewport_height": 1336,
        "dom.viewport_width": 976,
        "ut.domain": "tealium.net",
        "ut.version": "ut4.46.202205181037",
        "ut.event": "view",
        "ut.visitor_id": "0180d6afbfe5001fb3c58332996b05079004c07100fb8",
        "ut.session_id": "1652869283813",
        "ut.account": "services-caleb",
        "ut.profile": "usercentrics-v2-by-tag",
        "ut.env": "qa",
        "tealium_event": "view",
        "tealium_visitor_id": "0180d6afbfe5001fb3c58332996b05079004c07100fb8",
        "tealium_session_id": "1652869283813",
        "tealium_session_number": "1",
        "tealium_session_event_number": "5",
        "tealium_datasource": "",
        "tealium_account": "services-caleb",
        "tealium_profile": "usercentrics-v2-by-tag",
        "tealium_environment": "qa",
        "tealium_random": "8882989585076650",
        "tealium_library_name": "utag.js",
        "tealium_library_version": "4.46.0",
        "tealium_timestamp_epoch": 1652870355,
        "tealium_timestamp_utc": "2022-05-18T10:39:15.221Z",
        "tealium_timestamp_local": "2022-05-18T12:39:15.221",
        "tci.purposes_with_consent_all": [
            "Tealium iQ Tag Management",
            "Mouseflow",
            "Usercentrics Consent Management Platform"
        ],
        "tci.consent_type": "implicit",
        "tci.event_id": "16986703777223354612453473096",
        "tci.purposes_with_consent_unprocessed": [],
        "tci.purposes_with_consent_processed": [
            "Tealium iQ Tag Management",
            "Mouseflow",
            "Usercentrics Consent Management Platform"
        ]
    },
    "cfg": {
        "cb": null,
        "uids": [
            10,
            7
        ],
        "originalUids": [
            7,
            10
        ],
        "blockedTagUids": [
            10
        ]
    }
}
*/
