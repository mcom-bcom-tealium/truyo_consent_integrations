//tealium universal tag - utag.gdpr ut4.0.##UTVERSION##, Copyright ##UTYEAR## Tealium.com Inc. All Rights Reserved.
//tv:3.1.0
utag.gdpr = {
    consent_prompt : {
        noShow : false,
        isEnabled : ##UTCONSENTENABLED##,
        content : {}
},
preferences_prompt : {
##UTSINGLECOOKIE##
    noShow : false,
        isEnabled: ##UTPREFERENCESENABLED##,
    defaultState : ##UTPREFERENCESTATE##,
    content : {},
    categories : ##UTPREFERENCESCATS##
},
// Do Not Sell functionality is integrated with GDPR consent logic. The relevant logic is enabled as required
doNotSell : {
    noShow: ##UTDNSPROMPTNOSHOW##,
    isEnabled : ##UTDNSCONSENTENABLED##
},
getCategories : function(onlyEnabledCats){
    if (!(utag.gdpr.preferences_prompt && utag.gdpr.preferences_prompt.categories)) {
        return [];
    }
    var length    = utag.gdpr.keys(utag.gdpr.preferences_prompt.categories).length,
        cats      = new Array(length),
        gdpr_cats = utag.gdpr.preferences_prompt.categories;
    for (var cat in gdpr_cats){
        if (!gdpr_cats.hasOwnProperty(cat)) {
            continue;
        }
        var isCatEnabled = gdpr_cats[cat].enabled === true || gdpr_cats[cat].enabled == 1; //The JSON can be true | "1" | 1
        if (onlyEnabledCats && !isCatEnabled) {
            continue;
        }
        cats[gdpr_cats[cat].id - 1] = cat;
    }

    for (var i = cats.length - 1; i >= 0; i--){
        if (cats[i] === undefined) {
            cats.splice(i, 1);
        }
    }

    return cats;
},
getSelectedCategories : function(){
    var sc = [], gc = utag.gdpr.getCategories(true), cs = utag.gdpr.getConsentState(), i;

    try {
        if (typeof cs === "number") {
            return (parseInt(cs) === 1) ? gc : sc;
        } else {
            for (i in utag.loader.GV(cs)){
                if ("1" === cs[i].ct) {
                    sc.push(cs[i].name);
                }
            }
        }
    }
    catch (e) {
        utag.DB(e);
    }

    return sc;
},
getCategoryLanguage : function(category){
    if (!(utag.gdpr.preferences_prompt && utag.gdpr.preferences_prompt.categories)) {
        return [];
    }
    var language = utag.gdpr.getLanguage(utag.gdpr.preferences_prompt);
    return utag.gdpr.preferences_prompt.languages[language].categories[category];
},
getConsentState : function(){
    var re         = /^c\d+/,
        cd         = utag.gdpr.getCookieValues(),
        np         = 1,
        gc         = utag.gdpr.getCategories(),
        pc         = (function(gc){
            var pc = [];
            for (var i = 0; i < gc.length; i++){
                pc.push({
                    ct : null,
                    name : gc[i]
                });
            }
            return pc;
        }(gc)),
        filteredCD = (function(cd){
            var d = {};
            for (var prop in cd){
                if (!cd.hasOwnProperty(prop)) {
                    continue;
                }
                if (re.test(prop)) {
                    d[prop] = cd[prop];
                }
            }
            return d;
        }(cd));

    filteredCD = utag.gdpr.sortedObject(filteredCD, function(val1, val2){
        var idx1 = parseInt((val1 || "").substring(1), 10),
            idx2 = parseInt((val2 || "").substring(1), 10);
        if (isNaN(idx1) || isNaN(idx2)) {
            return 0;
        }
        return idx1 > idx2 ? 1 : -1;
    });

    for (var cn in utag.loader.GV(filteredCD)){
        if (cn.match(re)) {
            var idx = parseInt(cn.substring(1), 10) - 1,
                ct  = gc[idx];
            pc[idx].ct = cd[cn];
            if (cd[cn] * 1 !== 1) {
                np = 0;
            }
        }
    }
    if (cd.consent) {
        if (cd.consent === true || cd.consent === "true") {
            return np ? np : pc;
        } else {
            return -1;
        }
    } else if (np === 0) {
        return pc;
    } else {
        return 0;
    }
},
getCookieValues : function(){
    var values = {},
        rcd    = (function(){
            var value = "; " + document.cookie;
            var parts = value.split("; " + utag.gdpr.cookieNS + "=");
            if (parts.length == 2) return utag.ut.decode(parts.pop().split(";").shift());
        }()),
        cd     = utag.gdpr.typeOf(rcd) === "string" ? rcd : "";

    if (utag.data && cd) {
        utag.data["cp." + utag.gdpr.cookieNS] = cd;
    }

    if (cd) {
        var i,
            optOut,
            optOutData = decodeURI(cd).split("|");
        for (i = 0; i < optOutData.length; i++){
            optOut = optOutData[i].split(":");
            values[optOut[0]] = optOut[1];
        }
    }
    utag.gdpr.values = values;
    return values;
},
getDeTokenizedContent : function(data, _lang){
    if (utag.gdpr.isEmpty(data)) return null;

    var tokenRegExpPattern = /{{(.*?)}}/gm,
        token_match        = /[{}]/g,
        two_part           = /display_ads|big_data/;

    var lang     = utag.gdpr.getLanguage(data, _lang),
        langData = utag.gdpr.clone(data.languages[lang]);

    for (var t1 in utag.gdpr.sortedObject(langData.common_tokens)){
        if (!langData.common_tokens.hasOwnProperty(t1)) {
            continue;
        }

        langData.common_tokens[t1] = tokenReplace(langData.common_tokens[t1]);
    }

    for (var t2 in utag.gdpr.sortedObject(langData.custom_tokens)){
        if (!langData.custom_tokens.hasOwnProperty(t2)) {
            continue;
        }

        langData.custom_tokens[t2] = tokenReplace(langData.custom_tokens[t2]);
    }

    function tokenReplace(str){
        if (!str) return str;
        var replacements = str.match(tokenRegExpPattern);
        if (!replacements) return str;
        for (var i = 0; i < replacements.length; i++){
            var token = replacements[i].replace(token_match, "") || "";
            var regExpReplaceAll = new RegExp(replacements[i],"g");
            if (langData.common_tokens[token]) {
                str = str.replace(regExpReplaceAll, langData.common_tokens[token]);
            } else if (langData.custom_tokens[token]) {
                str = str.replace(regExpReplaceAll, langData.custom_tokens[token]);
            } else if (langData.categories && token.indexOf("category_") > -1) {
                var split_token = token.split("_");
                if (token.match(two_part)) {
                    split_token[1] = split_token[1] + "_" + split_token[2];
                    split_token.splice(2, 1);
                }
                var category = langData.categories[split_token[1]],
                    key      = {
                        "title" : "name",
                        "description" : "notes"
                    }[split_token[2]];
                if (category[key]) {
                    str = str.replace(regExpReplaceAll, category[key]);
                }
            }
        }
        return str;
    }

    return {
        language: lang,
        tokens: langData,
        js : tokenReplace(data.content.js),
        html : tokenReplace(data.content.html),
        css : tokenReplace(data.content.css)
    };
},
getLanguage : function(promptData, preferredLang){
    var udoName = window.utag.udoname || "utag_data";
    var dataObject = window.utag.data || window[udoName];
    var langLocale = (preferredLang || dataObject[window.utag.cfg.gdprDLRef] || (navigator.languages && navigator.languages[0] || navigator.language || navigator.userLanguage)).toLowerCase();
    var lang = (langLocale || "").split("-")[0];
    if (!promptData) {
        return langLocale;
    }
    var languages = promptData.languages;
    return languages[langLocale] ? langLocale : languages[lang] ? lang : promptData.defaultLang;
},
getTokenLanguage : function(promptData, token, lang){
    if (utag.gdpr.isEmpty(promptData)) return null;
    if (utag.gdpr.isEmpty(token)) return null;

    var getDeTokenizedContent = utag.gdpr.getDeTokenizedContent(promptData, lang);
    var langData = getDeTokenizedContent.tokens;

    if (lang && getDeTokenizedContent.language !== lang) return null;

    if (utag.gdpr.isEmpty(langData)) return null;

    if (langData.common_tokens[token]) {
        return langData.common_tokens[token];
    } else if (langData.custom_tokens[token]) {
        return langData.custom_tokens[token];
    } else if (langData.categories && token.indexOf("category_") > -1) {
        var split_token = token.split("_"),
            category    = langData.categories[split_token[1]];
        if (category[split_token[2]]) {
            return category[split_token[2]];
        }
    }

    return null;
},
refreshCookie:function(){if (utag && utag.DB) {utag.DB("utag.gdpr.refreshCookie has been deprecated");}},
setCookie : function(cookieData){
    utag.DB("Consent Manager: Set Cookie");
    if (utag.gdpr.typeOf(cookieData) !== "object") {
        return;
    }

    if (utag.gdpr.keys(cookieData).length === 0) {
        return;
    }
    var consentType = utag.gdpr.typeOf(cookieData.consent);

    if (consentType === "number") {
        cookieData.consent = cookieData.consent == 1; //convert a 1 to true, everything else is false
        consentType = utag.gdpr.typeOf(cookieData.consent);
    }

    if (consentType !== "boolean" &&
        !(consentType === "string" && (cookieData.consent.toLowerCase() === "true" || cookieData.consent.toLowerCase() === "false"))) {
        utag.DB("Invalid option sent to setCookie [consent must be true/false]");
        return;
    }

    if (utag.gdpr.typeOf(cookieData.ts) !== "number" || (cookieData.ts.toString().length !== 13)) {
        cookieData.ts = new Date().getTime();
    }

    utag.gdpr.values = cookieData;

    var mo2Val = [];

    for (var i in utag.loader.GV(cookieData)){

        if (/^(consent|dns|ts|id|c\d+)$/.test(i)) {
            mo2Val.push(i + ":" + cookieData[i]);
        } else {
            utag.DB("Invalid option sent to setCookie [" + i + "], is unknown");
        }
    }

    var daysToSet = utag.gdpr.consentPeriod;

    if (!daysToSet) {
        var expiryMonths = cookieData.dns == undefined ? 12 : 13;
        var today = new Date();
        today.setMonth(today.getMonth() + expiryMonths);
        daysToSet = Math.ceil((today.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    }

    var expiry = new Date(cookieData.ts);
    expiry.setDate(expiry.getDate() + daysToSet);

    var cookie_string = [
        utag.gdpr.cookieNS +"="+ encodeURI(mo2Val.join("|")),
        "path=" + utag.gdpr.path,
        "expires=" + expiry.toGMTString()];
    if (utag.gdpr.domain){
        cookie_string.push("domain=" + utag.gdpr.domain);
    }
    document.cookie = cookie_string.join("; ");
    utag.data["cp." + utag.gdpr.cookieNS] = mo2Val.join("|"); // Keep utag.data in sync with what's in the cookie
},
defaultConsentForDoNotSell : function(key, cookieData){
    if (key === 'dns'){ // Fixes the issue where consent is nonexistent in a purely DNS scenario.
        var consentType = utag.gdpr.typeOf(cookieData.consent);
        if (consentType === "undefined") {
            utag.DB("Consent Manager: Defaulting missing consent for Do Not Sell.");
            cookieData.consent = "true";
        }
    }
    return cookieData;
},
setCookieValue : function(key, value){
    utag.DB("Consent Manager: Set Cookie Value");
    if (!key || (utag.gdpr.typeOf(value) === "undefined" || utag.gdpr.typeOf(value) === "null")) return;
    var cookieData = utag.handler.C(utag.gdpr.getCookieValues());
    cookieData[key] = value;
    cookieData = utag.gdpr.defaultConsentForDoNotSell(key, cookieData);

    utag.gdpr.setCookie(cookieData);
},
setConsentValue : function(_response){
    utag.DB("Consent Manager: Set Consent Value: " + _response);
    var valid = {
        true : 1,
        "true" : 1,
        1 : 1,
        false : 0,
        "false" : 0,
        0 : 0
    };
    if (!valid.hasOwnProperty(_response)) {
        throw new Error("No response supplied");
    }
    var response = valid[_response] === 1;
    utag.gdpr.setCookieValue("ts", new Date().getTime()); //timestamp
    utag.gdpr.setCookieValue("consent", response); //response

    utag.gdpr.processQueue(response);
##UTFULLCONSENTEVENT##
    // emit consent events for consumption by any client or tool
    try {
        var decision = response ? utag.gdpr.getCategories(true) : []
        decision.unshift('always_on');
        decision.type = 'explicit';
        window.tealiumConsentRegister.addConsentDecision(decision);
    } catch(e) {
        utag.DB(e);
    }
},
setPreferencesValues : function(categories, noCollect){
    utag.DB("Consent Manager: Set Preferences Values");
    var i,
        fld,
        cookie_data  = utag.gdpr.getCookieValues(),
        lookup       = {},
        rgx          = /\D/,
        names        = utag.gdpr.getCategories(),
        chosen_list  = [],
        consent_seen = false,
        decline_seen = false,
        crgx         = /c\d/;

    if (utag.gdpr.typeOf(categories) !== "object") {
        utag.DB("Categories is not type object.");
        return;
    }

    try {
        for (i = 0; i < names.length; i++){
            lookup[names[i]] = "c" + (i + 1);
        }
        for (var cat in categories){
            if (!categories.hasOwnProperty(cat)) {
                continue;
            }
            if (categories[cat] !== "1" && categories[cat] !== "0" && categories[cat] !== 1 && categories[cat] !== 0) {
                continue;
            }
            if (cat.match(rgx)) {
                cookie_data[lookup[cat]] = categories[cat];
                if (categories[cat] != 0) {
                    chosen_list.push(cat);
                }
            } else {
                cookie_data["c" + cat] = categories[cat];
                if (categories[cat] != 0) {
                    chosen_list.push(names[cat - 1]);
                }
            }
        }

        for (fld in utag.loader.GV(cookie_data)){
            if (fld.match(crgx)) {
                if (cookie_data[fld] != 0) {
                    consent_seen = true;
                } else {
                    decline_seen = true;
                }
            }
        }
        cookie_data["ts"] = new Date().getTime();
        cookie_data["consent"] = consent_seen;
        utag.gdpr.setCookie(cookie_data);
        utag.gdpr.processQueue(consent_seen);
    }
    catch (e) {
        utag.DB(e);
    }

    if (noCollect) {
        return;
    }

##UTPARTIALCONSENTEVENT##
    // emit consent events for consumption by any client or tool
    try {
        var decision = (function () {
            var consentCategories;
            if (decline_seen) {
              if (consent_seen) {
                consentCategories = utag.gdpr.getSelectedCategories();
              } else {
                consentCategories = [];
              }
            } else if (!decline_seen && consent_seen) {
              consentCategories = utag.gdpr.getSelectedCategories();
            }
            consentCategories.unshift('always_on');
            consentCategories.type = 'explicit';
            return consentCategories;
        }());
        decision.type = 'explicit';
        window.tealiumConsentRegister.addConsentDecision(decision);
    } catch(e) {
        utag.DB(e);
    }
},
setAllCategories : function(state, noCollect){
    utag.DB("Consent Manager: Set Preferences All Categories: " + state);
    if (state === undefined) return;
    if (utag.gdpr.typeOf(state) !== "boolean") return;
    var allCats = utag.gdpr.getCategories(), prefs = {};
    for (var i = 0; i < allCats.length; i++){
        prefs["" + (i + 1)] = state ? "1" : "0";
    }
    utag.gdpr.setPreferencesValues(prefs, noCollect);
},
setPreferencesFromList : function(list){
    utag.DB("Consent Manager: Set Preferences From List");
    var prefs = {}, allCats = utag.gdpr.getCategories();
    if (utag.gdpr.typeOf(list) !== "array") {
        utag.DB("List should be of type array");
        return;
    }
    for (var i = 0; i < list.length; i++){
        prefs[list[i]] = "1";
    }
    for (var j = 0; j < allCats.length; j++){
        if (!prefs[allCats[j]]) {
            prefs[allCats[j]] = "0";
        }
    }
    utag.gdpr.setPreferencesValues(prefs);
},
processQueue : function(consent_seen){
    utag.DB("Consent Manager: Processing Consent Queue");
    if (utag.gdpr.noqueue) {
        return;
    }
    if (!consent_seen) {
        utag.gdpr.queue = [];
        return;
    }
    utag.DB("Consent Manager: Processing Consent Queue Length: " + utag.gdpr.queue.length);
    var event, data, conds = {};

    //create a new cond object for us to modify
    utag.gdpr.merge(conds, utag.cond);
    for (var i = 0; i < utag.gdpr.queue.length; i++){
        event = utag.gdpr.queue[i];
        if (!(event.cfg && event.cfg.uids)) {
            data = {};
            //Copy core data over
            utag.loader.RD(data, event.event);
            //Copy data user sent
            utag.gdpr.merge(data, event.data, true);

            //Make sure we reset all conds to 0/false;
            for (var cond in conds){
                if (!conds.hasOwnProperty(cond)) {
                    continue;
                }
                conds[cond] = 0;
            }

            //Need to trigger the BLR extensions before re-processing the load rules
            utag.handler.RE(event.event, data, "blr");

            //Find out what LRs trigger for the data we have
            utag.loader.loadrules(data, conds);

            event.cfg = event.cfg || {};
            event.cfg.uids = [];
            event.data = data;

            //Store conds into utag.conds so that the initcfg can pull them in for setting the tags (& any future extensions)
            utag.cond = conds;
            //Call initcfg so we can get utag.loader.cfg[X].load evaluated
            utag.loader.initcfg();

            //Re-apply consentState
            utag.gdpr.applyConsentState();

            //create an array of UIDs to call, excluding the omittedTags as they have already fired.
            var consentState = utag.gdpr.getConsentState();
            var csType = utag.gdpr.typeOf(consentState);
            for (var id in utag.loader.GV(utag.loader.cfg)){
                if (utag.gdpr.omittedTags[id]) continue;
                var tag = utag.loader.cfg[id];
                if(tag.load && tag.send) {
                    if (tag.tcat !== 0) {
                        if ((csType === "array" && consentState[tag.tcat - 1].ct == "1") ||
                            (csType === "number" && consentState == 1)) {
                            event.cfg.uids.push(id);
                        }
                    } else if (tag.tcat === 0) {
                        event.cfg.uids.push(id);
                    }
                }
            }
        }
        // call old track call with data from the array
        // call - this is correct as we are using the stored event as an object
        // add a setTimeout to space the events out more
        (function(event){
            setTimeout(function(){
                if (event.cfg.uids) {
                    // make sure that we remove omitted tag uids as these have already gone through the process
                    for (var indexCfgUID = event.cfg.uids.length - 1;  indexCfgUID > -1; indexCfgUID--){
                        if (!utag.gdpr.omittedTags[event.cfg.uids[indexCfgUID]]) continue;
                        event.cfg.uids.splice(indexCfgUID,1);
                    }
                }
                utag.track_old.call(this, event);
            }, 150 * i);
        })(event);

    }
    utag.gdpr.queue = [];

},
typeOf : function(e){
    return ({}).toString.call(e).match(/\s([a-zA-Z]+)/)[1].toLowerCase();
},
merge : function(a, b, c, d){
    if (c) {
        for (d in utag.loader.GV(b)){
            a[d] = b[d];
        }
    } else {
        for (d in utag.loader.GV(b)){
            if (typeof a[d] == "undefined")
                a[d] = b[d];
        }
    }
},
getEnforcementMode: function () {
    utag.gdpr.promptEnabledSetting(); // make sure the enforcement rules are applied
    var optOutModulesAreActive = (utag.gdpr.consent_prompt && utag.gdpr.consent_prompt.isEnabled === true);
    var optInModuleIsActive = (utag.gdpr.doNotSell && utag.gdpr.doNotSell.isEnabled === true);
    var enforcementMode = 'opt-in';
    if (!optOutModulesAreActive && optInModuleIsActive) enforcementMode = 'opt-out';
    if (!optOutModulesAreActive && !optInModuleIsActive) enforcementMode = 'none';
    return enforcementMode;
},
shouldBlockTag : function(taguid){
    if (!taguid) return true;
    var enforcementMode = utag.gdpr.getEnforcementMode();
    if (enforcementMode === 'none') return false;

    var lc = utag.loader.cfg,
        cs = utag.gdpr.getConsentState(),
        uid = taguid;
    //If no uid then this function shouldn't of been called.
    //To be safe we will stop any firing
    if (utag.gdpr.typeOf(uid) === "undefined") return true;
    utag.DB("Consent Manager: Applying consent: " + uid);
    var csTYpe = utag.gdpr.typeOf(cs);
    var tag = lc[uid];
    
    // fix cases where a missing or inactive tag is explicitly called by UID
    if (typeof tag !== "object") {
        utag.DB("Consent Manager: Missing/inactive tag: " + uid + " not allowed to send (nothing to fire anyway)");
        return true; 
    }

    // improve DNS module (Opt-out module) detection to avoid bugs
    var blockedTagLookup = utag.gdpr.dns ? utag.gdpr.dns.getBlockedDnsTagLookup() : {};

    if (enforcementMode === 'opt-out' && tag.send && tag.tcat !== 0) {
        // if there's no lookup here, all tags are allowed because there is no opt-out signal even though we're in opt-out mode
        if (blockedTagLookup === null) {
            utag.DB("Consent Manager: Applying consent: " + uid + " allowed to send (enforcement is off).");
            return false;
        }
        if (parseInt(blockedTagLookup[uid]) !== 1) {
            utag.DB("Consent Manager: Applying consent: " + uid + " allowed to send");
            return false;
        }
    } 
    
    if (enforcementMode === 'opt-in') {
        if ((utag.gdpr.omittedTags[uid] || tag.tcat == 0) && tag.send){
            utag.DB("Consent Manager: Omitted Tag: " + uid + " allowed to send");
            return false;
        }
    
        if ((csTYpe === "array" && cs[tag.tcat - 1].ct == "1") || (csTYpe === "number" && cs == 1)){
            utag.DB("Consent Manager: Applying consent: " + uid + " allowed to send");
            return false;
        }   
    }

    utag.DB("Consent Manager: Applying consent: " + uid + " not allowed to send");
    return true;
},
applyConsentState : function(){
    // if we don't need to enforce, don't enforce at all
    var enforcementMode = utag.gdpr.getEnforcementMode()
    if (enforcementMode === 'none') return;
    
    utag.DB("Consent Manager: Applying consent");
    try {
        var i, lc = utag.loader.cfg, cs = utag.gdpr.getConsentState(),
            ot                          = utag.gdpr.omittedTags;

        if (typeof cs === "number") {
            if ((utag.gdpr.consent_prompt.isEnabled && parseInt(cs) !== 1) ||
                ((!utag.gdpr.consent_prompt.isEnabled && utag.gdpr.preferences_prompt.isEnabled) && parseInt(cs) === -1)) {
                utag.DB("Consent Manager: Setting all tags to off");
                for (i in utag.loader.GV(lc)){
                    if (typeof ot[i] === "undefined") {
                        lc[i].load = 0;
                    }
                }
            }
        } else if (utag.gdpr.consent_prompt.isEnabled || utag.gdpr.preferences_prompt.isEnabled) { // GDPR Partial consent
            utag.DB("Consent Manager: Partial Consent");
            for (i in utag.loader.GV(lc)){
                if (typeof ot[i] === "undefined") {
                    if (lc[i].tcat > 0 && cs[lc[i].tcat - 1].ct != "1") {
                        lc[i].load = 0;
                    }
                }
            }
        }
        // CCPA Do Not Sell
        var btl = utag.gdpr.dns ? utag.gdpr.dns.getBlockedDnsTagLookup() : null;
        utag.DB("Consent Manager: Do Not Sell Tags");
        if (enforcementMode === 'opt-out' && btl) { // If dns isn't in use, this will be null
            for (i in utag.loader.GV(lc)) {
                if (parseInt(btl[i]) === 1) {
                    lc[i].load = 0;
                }
            }
        }
        // fallback logic
        try {
            if (window.tealiumConsentRegister && window.tealiumConsentRegister.currentDecision === null) {
                var cookieValues = utag.gdpr.getCookieValues();
                var hasDnsCookie = typeof cookieValues.dns === 'string';
                var hasConsentCookie = typeof cookieValues.consent === 'string';
                var decisionType = (enforcementMode === 'opt-in' && hasConsentCookie) || (enforcementMode === 'opt-out' && hasDnsCookie)  ? 'explicit' : 'implicit';
                var decision = (decisionType === 'implicit' && enforcementMode === 'opt-in')  ? [] : utag.gdpr.getSelectedCategories();
                decision.unshift('always_on');
                decision.type = decisionType;
                window.tealiumConsentRegister.addConsentDecision(decision);
            }
        } catch(e) {
            utag.DB(e);
        }

    }
    catch (e) {
        utag.DB(e);
    }
},
updateConsentCookie : function(consent_categories){
    utag.DB("Consent Manager: Updating consent cookie");
    var list,
        listType = utag.gdpr.typeOf(consent_categories);
    if (listType === "string") {
        list = consent_categories.split(/\s*,\s*/);
    } else if (listType !== "array") {
        list = [];
    } else {
        list = consent_categories.slice();
    }

    if (list.length === 0) {
        utag.gdpr.setConsentValue(false);
        utag.gdpr.setAllCategories(false);
        return;
    }

    utag.gdpr.setPreferencesFromList(list);
},
keys : function(obj){
    if (Object.keys) {
        return Object.keys(obj);
    }
    var array = [];
    for (var prop in obj){
        if (!obj.hasOwnProperty(prop)) {
            continue;
        }
        array.push(prop);
    }
    return array;
},
sortedObject : function(obj, func){
    var _obj = {};
    if (obj !== undefined) {
        var _k1 = utag.gdpr.keys(obj).sort(func);
        for (var z = 0; z < _k1.length; z++){
            _obj[_k1[z]] = obj[_k1[z]];
        }
    }
    return _obj;
},
clone: function(a) {
    var level = 0;
    return cloner(a);
    function cloner(a){
        var b = {};
        var c;
        level++;
        if (level === 5) return a;
        for (c in utag.loader.GV(a)) {
            if (utag.gdpr.typeOf(a[c]) === "array") {
                b[c] = a[c].slice(0)
            } else if (utag.gdpr.typeOf(a[c]) === "object") {
                b[c] = cloner(a[c]);
            } else {
                b[c] = a[c];
            }
        }
        level--;
        return b;
    }
},
isEmpty : function(obj){
    var t = utag.gdpr.typeOf(obj);
    switch (t){
        case "string":
        case "array":
            return obj.length === 0;
        case "object":
            for (var p in obj){
                if (!obj.hasOwnProperty(p)) {
                    continue;
                }
                return false;
            }
        default:
            return true;
    }
},
getTraceId : function() {
    var cookieName = "trace_id=";
    var decodedCookie = decodeURIComponent(document.cookie);
    var ca = decodedCookie.split(';');
    var cookie = ca.find(item => item.trim().startsWith(cookieName));
    cookie = cookie ? cookie.trim() : cookie;
    return cookie ? cookie.substring(cookieName.length, cookie.length) : "";
},
setVisitorId : function() {
    var visitorId;
    var consentCookies = utag.gdpr.getCookieValues();

    if (consentCookies && consentCookies.id) {
        visitorId = consentCookies.id;
    } else if (utag.data['cp.utag_main_v_id']) {
        visitorId = utag.data['cp.utag_main_v_id'];
    } else {
        visitorId = utag.ut.vi((new Date()).getTime());
    }

    utag.gdpr.setCookieValue('id', visitorId)
    return visitorId;
},
  queue : [],
    domain : window.utag_cfg_ovrd && window.utag_cfg_ovrd.domain || utag.cfg.domain,
    path : window.utag_cfg_ovrd && window.utag_cfg_ovrd.cookie_path || "/",
    noqueue : window.utag_cfg_ovrd && window.utag_cfg_ovrd.nogdprqueue || false,
    noview : window.utag_cfg_ovrd && window.utag_cfg_ovrd.noview || false,
    consentPeriod : (window.utag_cfg_ovrd && window.utag_cfg_ovrd.consentPeriod) || 0,
    cookieNS : window.utag_cfg_ovrd && window.utag_cfg_ovrd.cmcookiens || "CONSENTMGR",
    eventProfile : window.utag_cfg_ovrd && window.utag_cfg_ovrd.cmeventprofile || "##UTCONSENTPROFILE##" || "main",
    omittedTags : ##UTOPTOUTTAGS##
};

if (window.utag_cfg_ovrd && window.utag_cfg_ovrd.domain == ""){
    utag.gdpr.domain = "";
}

utag.loader.initdataOld = utag.loader.initdata;
utag.loader.initdata = function(){
    utag.loader.initdataOld();
    if (utag.gdpr.getConsentState() !== 0) return;
    if (utag.gdpr.noview) return;
    if (!utag.loader.rd_flag && !utag.gdpr.noqueue) {
        utag.gdpr.queue.push({
            event : "view",
            data : utag.handler.C(utag.data)
        });
    }
};

utag.gdpr.promptEnabledSetting = function() {
    if (!utag.gdpr.dr && (utag.cfg.readywait || utag.cfg.waittimer)) {
        utag.gdpr.dr = 1;
        return;
    }
    if (utag.gdpr.consent_prompt.isEnabled === true && !(##UTCMGRCOND##)) {
        utag.gdpr.consent_prompt.isEnabled = false;
    }
    if (utag.gdpr.doNotSell.isEnabled === true && !(##UTDNSCOND##)) {
        utag.gdpr.doNotSell.isEnabled = false;
    }
}

utag.preOld = utag.pre;
utag.pre = function(){
    utag.preOld();
    utag.gdpr.promptEnabledSetting();
    utag.pre = utag.preOld;
};

##UTCONSENTEXPLICITDEF##
##UTCONSENTPREFERENCEDEF##
##UTDONOTSELLDEF##
##UTDONOTSELLPROMPT##

utag.track_old = utag.track;
utag.track = function(a, b, c, d){
    if (typeof a == "string") a = {
        event : a,
        data : b,
        cfg : {
            cb : c,
            uids : d
        }
    };
    if (a.event === "update_consent_cookie" && b.consent_categories) {
        utag.gdpr.updateConsentCookie(b.consent_categories);
    } else if (a.event === "set_dns_state" && typeof b.do_not_sell !== 'undefined') {
        utag.gdpr.dns.setDnsState(b.do_not_sell);
    } else {
        if (utag.gdpr.getConsentState() === 0) {
            if (!utag.gdpr.noqueue) utag.gdpr.queue.push({
                event : a.event,
                data : utag.handler.C(a.data),
                cfg : utag.handler.C(a.cfg)
            });
        }
        if (a.cfg.uids) {
            var uids = [];
            for (var i = 0; i < a.cfg.uids.length; i++){
                if (!utag.gdpr.shouldBlockTag(a.cfg.uids[i])) {
                    uids.push(a.cfg.uids[i]);
                }
            }
            a.cfg.uids = uids;
        }
        return utag.track_old.apply(this, arguments);
    }
};
utag.loader.OU_old = utag.loader.OU;
utag.loader.OU = function(tid){
    try {
        utag.gdpr.applyConsentState();
    }
    catch (e) {
        utag.DB(e);
    }
};

if (utag.gdpr.preferences_prompt.single_cookie) {
    window.utag_cfg_ovrd = window.utag_cfg_ovrd || {};
    utag.loader.SC("utag_main", null, "da");
    window.utag_cfg_ovrd.nocookie = true;
}
if (!utag.gdpr.consent_prompt.isEnabled && !utag.gdpr.doNotSell.isEnabled && utag.gdpr.getConsentState() == 0) {
    utag.gdpr.setAllCategories(utag.gdpr.preferences_prompt.defaultState, !0);
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
        const event = new CustomEvent(eventType, { detail: { decision: decision} });
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

window.tealiumConsentRegister = window.tealiumConsentRegister || new TealiumConsentRegister();
