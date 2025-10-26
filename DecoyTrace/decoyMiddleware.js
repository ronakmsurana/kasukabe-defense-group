require('dotenv').config();
const crypto = require('crypto');
const { faker } = require('@faker-js/faker');
const logicConfig = require('./decoy_config.json');
const userConfig = require('./user_config.json');
const breachProtocol = require('./breachProtocol');

// --- Load Config ---
const DECOY_KEY = process.env.DECOY_SECRET_KEY;
const REAL_KEY = process.env.REAL_SECRET_KEY;
const { identifierField, hmacField, identifierType } = logicConfig.strategy;
const FAKER_MAP = logicConfig.fakerMap;
const MAX_DATA_BYTES = logicConfig.heuristics?.maxDataBytes || 5242880;
const WHITELISTED_ROLES = new Set(logicConfig.whitelist?.roles || []);

// --- Helpers ---
function createHmac(data, key) {
  return crypto.createHmac('sha256', key).update(data.toString()).digest('hex');
}
function getFakerMethod(methodString, fakerMap) {
  let [category, method] = methodString.split('.');
  if (faker[category] && faker[category][method]) return faker[category][method];
  const fakerMethodPath = fakerMap[methodString];
  if (fakerMethodPath) {
    [category, method] = fakerMethodPath.split('.');
    if (faker[category] && faker[category][method]) return faker[category][method];
  }
  return () => `[Invalid Method: ${methodString}]`;
}
const getNewId = getFakerMethod(identifierType, FAKER_MAP);

// --- Build POST route map ---
const createRouteMap = new Map();
(userConfig.collections || userConfig.tables || []).forEach(target => {
  if (target.createEndpoint) {
    createRouteMap.set(target.createEndpoint, true);
  }
});

// --- Store the dev-provided function ---
let roleExtractor = (req) => null;

// -----------------------------------------------------------------
// ASYNC CHECKER (for normal users/attackers)
// -----------------------------------------------------------------
const checkData = async (data, requestInfo) => {
  try {
    const records = Array.isArray(data) ? data : [data];
    if (records.length === 0) return;
    for (const record of records) {
      if (record && record[identifierField] && record[hmacField]) {
        const uniqueId = record[identifierField];
        const dataCode = record[hmacField];
        const decoyHash = createHmac(uniqueId, DECOY_KEY);
        if (decoyHash === dataCode) {
          breachProtocol.triggerAlert(requestInfo, data, 'high');
          return;
        }
      }
    }
  } catch (e) { console.error('[CHECKER]: Error in async check:', e.message); }
};

// -----------------------------------------------------------------
// PRE-SAVE SIGNER MIDDLEWARE
// -----------------------------------------------------------------
const preSaveSigner = (req, res, next) => {
  if (req.method !== 'POST' || !createRouteMap.has(req.originalUrl)) {
    return next();
  }
  const body = req.body;
  if (!body) return next();
  console.log(`[SIGNER]: Detected new data for ${req.originalUrl}. Signing with REAL_KEY...`);
  try {
    const newId = getNewId();
    const newHash = createHmac(newId, REAL_KEY);
    req.body[identifierField] = newId;
    req.body[hmacField] = newHash;
  } catch (err) { console.error(`[SIGNER]: Error signing new record: ${err.message}`); }
  next();
};

// -----------------------------------------------------------------
// THE MAIN INTERCEPTOR
// -----------------------------------------------------------------
// -----------------------------------------------------------------
// THE MAIN INTERCEPTOR (Corrected Logic)
// -----------------------------------------------------------------
// -----------------------------------------------------------------
// THE MAIN INTERCEPTOR (With Extra Debugging)
// -----------------------------------------------------------------
const decoyInterceptor = (req, res, next) => {
  const originalSend = res.send.bind(res);
  const requestInfo = { ip: req.ip, url: req.originalUrl, method: req.method };

  // --- Check for Whitelisted Role ---
  const userRole = roleExtractor(req);
  const isAdmin = userRole && WHITELISTED_ROLES.has(userRole);
  console.log(`[DEBUG INTERCEPTOR] Request Start. isAdmin = ${isAdmin}`); // <-- DEBUG 1

  // Patch res.send for everyone initially
  res.send = (body) => {
    console.log(`[DEBUG INTERCEPTOR] res.send called. isAdmin = ${isAdmin}`); // <-- DEBUG 2

    // --- 1. HEURISTIC CHECK ---
    if (body && body.length > MAX_DATA_BYTES) {
      console.log(`[DEBUG INTERCEPTOR] Heuristic Check Triggered.`); // <-- DEBUG 3
      if (isAdmin) {
        breachProtocol.triggerAlert(requestInfo, null, 'low');
        // Let it continue
      } else {
        breachProtocol.triggerAlert(requestInfo, null, 'high');
        sendHoneypot(req, res, req.ip, "Large data request", originalSend);
        console.log(`[DEBUG INTERCEPTOR] Heuristic Blocked Attacker. Returning.`); // <-- DEBUG 4
        return; // Stop immediately
      }
    }

    // --- 2. ADMIN PATH: Synchronous Filter ---
    if (isAdmin) {
      console.log(`[DEBUG INTERCEPTOR] Entering Admin Path.`); // <-- DEBUG 5
      // Log the yellow alert *only* if heuristic didn't already log it
      if (!(body && body.length > MAX_DATA_BYTES)) {
         breachProtocol.triggerAlert(requestInfo, null, 'low');
      }
      console.log(`[ADMIN]: Whitelisted role "${userRole}" detected. Filtering decoys...`);
      try {
        const data = JSON.parse(body);
        const cleanData = [];
        const records = Array.isArray(data) ? data : [data];
        for (const record of records) {
          if (record && record[identifierField] && record[hmacField]) {
            const uniqueId = record[identifierField];
            const dataCode = record[hmacField];
            const realHash = createHmac(uniqueId, REAL_KEY);
            if (realHash === dataCode) {
              cleanData.push(record);
            }
          }
        }
        console.log(`[DEBUG INTERCEPTOR] Admin Path: Sending Clean Data.`); // <-- DEBUG 6
        originalSend(JSON.stringify(cleanData)); // Send filtered data
      } catch (e) {
        console.log(`[DEBUG INTERCEPTOR] Admin Path: Error parsing JSON or sending.`); // <-- DEBUG 7
        originalSend(body); // Not JSON
      }
      console.log(`[DEBUG INTERCEPTOR] Admin Path: Returning.`); // <-- DEBUG 8
      // CRITICAL: Stop processing here for admins. Do not proceed to async check.
      return;
    }

    // --- 3. NORMAL USER / ATTACKER PATH: Asynchronous Check ---
    console.log(`[DEBUG INTERCEPTOR] Entering Normal/Attacker Path.`); // <-- DEBUG 9
    originalSend(body); // Send unfiltered data immediately

    // Check in background
    try {
      const data = JSON.parse(body);
      console.log(`[DEBUG INTERCEPTOR] Calling async checkData.`); // <-- DEBUG 10
      checkData(data, requestInfo); // Fire-and-forget async check
    } catch (e) {
      console.log(`[DEBUG INTERCEPTOR] Failed to parse JSON for async check.`); // <-- DEBUG 11
    }

  }; // End of patched res.send

  console.log(`[DEBUG INTERCEPTOR] Calling next() after patching res.send.`); // <-- DEBUG 12
  next(); // Continue to the route handler AFTER patching res.send
};

// -----------------------------------------------------------------
// MODULE EXPORTS
// -----------------------------------------------------------------
module.exports.init = (options = {}) => {
  if (options.roleExtractor && typeof options.roleExtractor === 'function') {
    roleExtractor = options.roleExtractor;
  } else {
    console.warn('[DecoyTrace]: No roleExtractor function provided. Admin whitelisting is disabled.');
  }
  
  // Return an array of all our middlewares
  return [preSaveSigner, decoyInterceptor];
};