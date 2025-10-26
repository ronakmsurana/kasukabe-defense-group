require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const http = require('http');
const { Server } = require("socket.io");


// --- NEW: Load all configs and adapter ---
const logicConfig = require('./decoy_config.json');
const userConfig = require('./user_config.json'); // <-- NEW
const breachProtocol = require('./breachProtocol');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
breachProtocol.init(io);

const port = 3000;

// --- NEW: Two adapters ---
let adapter; // For REAL data
let honeypotAdapter; // For FAKE data

// --- NEW: Add the express.json() middleware ---
// This is required. It parses incoming JSON into req.body.
app.use(express.json());

// -----------------------------------------------------------------
// Updated Adapter Loader (now takes a connection string)
// -----------------------------------------------------------------
function getAdapter(dbConfig, connectionString) {
  const dbType = dbConfig.type.toLowerCase();
  if (!connectionString) {
    console.error(`Error: Connection string is missing for DB type "${dbType}".`);
    return null; // Return null instead of exiting
  }
  try {
    const Adapter = require(`./adapters/${dbType}Adapter`);
    return new Adapter(connectionString);
  } catch (error) {
    console.error(`Error: Could not load adapter for database type "${dbType}".`);
    process.exit(1);
  }
}

// -----------------------------------------------------------------
// NEW: Centralized Honeypot Function
// -----------------------------------------------------------------
async function sendHoneypot(req, res, ip, reason, sendFunction = null) {
  console.log(`[FIREWALL]: 🛑 ${reason}. Rerouting IP: ${ip} to honeypot.`);
  
  // NEW LINE:
  // Manually parse the target from the URL
  const urlParts = req.originalUrl.split('/'); // e.g., ['', 'api', 'employees']
  const targetName = urlParts[2]; // This will be 'employees' or 'products'
  
  if (!targetName || !honeypotAdapter) {
    const payload = JSON.stringify([{ "message": "Data retrieved successfully" }]);
    if (sendFunction) sendFunction(payload);
    else res.status(200).json(JSON.parse(payload));
    return;
  }

  try {
    // --- THIS IS THE CORE LOGIC ---
    // Fetch data from the *honeypot* database instead of the real one
    const fakeData = await honeypotAdapter.find(targetName);
    const payload = JSON.stringify(fakeData);
    // --- NEW LOGIC ---
    if (sendFunction) {
      // If called from the interceptor, use the original send
      res.status(200); // Set status manually
      sendFunction(payload);
    } else {
      // If called from the firewall, use the normal res.json
      res.status(200).json(fakeData);
    }
    // -----------------
  } catch (err) {
    console.error(`[HONEYPOT]: Error fetching fake data: ${err.message}`);
    const payload = JSON.stringify([{ "id": "fake-001", "status": "ok" }]);
    if (sendFunction) sendFunction(payload);
    else res.status(200).json(JSON.parse(payload));
  }
  return;
}

// -----------------------------------------------------------------
// STEP 4: THE HONEYPOT FIREWALL (Updated)
// -----------------------------------------------------------------
const honeypotFirewall = (req, res, next) => {
  if (breachProtocol.ipBlacklist.has(req.ip)) {
    // Call the new honeypot function
    sendHoneypot(req, res, req.ip, "Blacklisted IP");
    return; // Stop the request
  }
  next();
};
app.use(honeypotFirewall);

// -----------------------------------------------------------------
// Load Secrets & Config (No change)
// -----------------------------------------------------------------
const DECOY_KEY = process.env.DECOY_SECRET_KEY;
const REAL_KEY = process.env.REAL_SECRET_KEY;
const ADMIN_BYPASS_KEY = process.env.ADMIN_BYPASS_KEY;
const { identifierField, hmacField, identifierType } = logicConfig.strategy;
const FAKER_MAP = logicConfig.fakerMap;
if (!DECOY_KEY || !identifierField || !hmacField || !REAL_KEY) {
  console.error("Error: Missing keys or strategy in config or env.");
  process.exit(1);
}

// --- NEW: Load Heuristics ---
// Default to 5MB if not set
const MAX_DATA_BYTES = logicConfig.heuristics?.maxDataBytes || 5242880;

// -----------------------------------------------------------------
// HMAC HELPER & FAKER HELPER
// -----------------------------------------------------------------
function createHmac(data, key) {
  return crypto.createHmac('sha256', key).update(data.toString()).digest('hex');
}
// We need faker to generate the new unique_id
const { faker } = require('@faker-js/faker'); 
function getFakerMethod(methodString, fakerMap) {
  // ... (copy this function from planter.js)
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

// --- NEW: Build a lookup map for POST routes ---
const createRouteMap = new Map();
(userConfig.collections || userConfig.tables || []).forEach(target => {
  if (target.createEndpoint) {
    createRouteMap.set(target.createEndpoint, true);
  }
});


// -----------------------------------------------------------------
// NEW: PRE-SAVE SIGNER MIDDLEWARE
// -----------------------------------------------------------------
const preSaveSigner = (req, res, next) => {
  // Only run on POST requests that are in our map
  if (req.method !== 'POST' || !createRouteMap.has(req.originalUrl)) {
    return next();
  }

  // Check for admin bypass. Admins can't create data?
  // Or maybe we still sign it. Let's sign it.
  
  const body = req.body;
  if (!body) {
    return next(); // Nothing to sign
  }

  console.log(`[SIGNER]: Detected new data for ${req.originalUrl}. Signing with REAL_KEY...`);
  
  try {
    // Generate the new ID and HMAC code
    const newId = getNewId();
    const newHash = createHmac(newId, REAL_KEY);

    // --- THIS IS THE CORE LOGIC ---
    // Inject our fields into the request body
    req.body[identifierField] = newId;
    req.body[hmacField] = newHash;
    // ---------------------------------

  } catch (err) {
    console.error(`[SIGNER]: Error signing new record: ${err.message}`);
    // Don't block the request, just log it
  }

  next(); // Pass the *modified* body to the real controller
};
// --- Apply the new middleware ---
app.use(preSaveSigner);



// -----------------------------------------------------------------
// STEP 1 & 2: COMBINED, SYNCHRONOUS INTERCEPTOR (Updated)
// -----------------------------------------------------------------
const checkData = async (data, requestInfo) => {
  try {
    const records = Array.isArray(data) ? data : [data];
    if (records.length === 0) return;

    for (const record of records) {
      if (record && record[identifierField] && record[hmacField]) {
        const uniqueId = record[identifierField];
        const dataCode = record[hmacField];

        // Check if it's a DECOY
        const decoyHash = createHmac(uniqueId, DECOY_KEY);
        if (decoyHash === dataCode) {
          // BREACH! This is a decoy.
          breachProtocol.triggerAlert(requestInfo, data, 'high');
          return; // Stop checking
        }
      }
    }
  } catch (e) {
    console.error('[CHECKER]: Error in async check:', e.message);
  }
};


// -----------------------------------------------------------------
// THE INTERCEPTOR (Updated with new Sync/Async logic)
// -----------------------------------------------------------------
const decoyInterceptor = (req, res, next) => {
  const originalSend = res.send.bind(res);
  const requestInfo = { ip: req.ip, url: req.originalUrl, method: req.method };
  const bypassHeader = req.headers['x-admin-bypass'];

  res.send = (body) => {
    // --- 1. HEURISTIC CHECK (Synchronous) ---
    // This check runs for EVERYONE (except admins who bypass)
    if (body && body.length > MAX_DATA_BYTES) {
      if (ADMIN_BYPASS_KEY && bypassHeader === ADMIN_BYPASS_KEY) {
        // This is an Admin, just log it as low threat
        breachProtocol.triggerAlert(requestInfo, null, 'low');
        // Let it pass through to the admin synchronous filter
      } else {
        // This is an Attacker, block them.
        breachProtocol.triggerAlert(requestInfo, null, 'high');
        sendHoneypot(req, res, req.ip, "Large data request", originalSend);
        return;
      }
    }

    // --- 2. ADMIN BYPASS (Synchronous Filter) ---
    if (ADMIN_BYPASS_KEY && bypassHeader === ADMIN_BYPASS_KEY) {
      console.log(`[ADMIN]: Admin request detected. Filtering decoys...`);
      try {
        const data = JSON.parse(body);
        const cleanData = []; // A new array for *only* real data
        const records = Array.isArray(data) ? data : [data];

        for (const record of records) {
          if (record && record[identifierField] && record[hmacField]) {
            const uniqueId = record[identifierField];
            const dataCode = record[hmacField];

            // Check if it's REAL data
            const realHash = createHmac(uniqueId, REAL_KEY);
            if (realHash === dataCode) {
              cleanData.push(record); // It's real, add it
            }
            // If it's a decoy, we simply... do nothing. It's filtered out.
          }
        }
        // Send the filtered list to the admin
        originalSend(JSON.stringify(cleanData));
      } catch (e) {
        originalSend(body); // Not JSON
      }
      return; // Stop here.
    }

    // --- 3. NORMAL USER / ATTACKER (Asynchronous Check) ---
    // If not an admin, send the data immediately for low latency
    originalSend(body);

    // And check the data in the background
    try {
      const data = JSON.parse(body);
      checkData(data, requestInfo); // Fire-and-forget
    } catch (e) {
      // Not JSON, skip
    }
  };

  next();
};
app.use('/api', decoyInterceptor);

// -----------------------------------------------------------------
// LIVE API ROUTES (Now 100% Dynamic)
// -----------------------------------------------------------------

// This single route handles ALL tables/collections from your config
app.get('/api/:target', async (req, res) => {
  const targetName = req.params.target;
  
  if (!adapter) {
    return res.status(500).json({ error: "Database not connected" });
  }

  console.log(`\n[APP]: Request for ALL "${targetName}". Fetching from LIVE database...`);
  
  try {
    // --- THIS IS THE CORE CHANGE ---
    // We call the generic 'find' method on our adapter
    const data = await adapter.find(targetName);
    // -----------------------------
    
    res.json(data);
    console.log('[APP]: Data sent to user.');
  
  } catch (err) {
    console.error(`[APP]: Error fetching data for target "${targetName}":`, err.message);
    res.status(500).json({ error: "Failed to fetch data." });
  }
});

// --- NEW: Add a POST route for testing ---
// This mocks the user's *real* API endpoint
app.post('/api/:target', async (req, res) => {
  const targetName = req.params.target;
  const newData = req.body; // This body *already has* our signed fields

  console.log(`[APP]: Received new data for ${targetName}.`);
  
  try {
    // We'll just log it. A real app would save it.
    // await adapter.insert(targetName, [newData]); // <-- This would save it
    console.log('[APP]: Data that would be saved (note the new fields):');
    console.log(newData);
    res.status(201).json({ success: true, data: newData });
  } catch (err) {
    res.status(500).json({ error: "Failed to save data." });
  }
});

// Route for the dashboard HTML
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// -----------------------------------------------------------------
// Start Server and Connect to DB
// -----------------------------------------------------------------
async function startServer() {
  try {
    // --- NEW: Connect to both databases ---
    adapter = getAdapter(userConfig.database, process.env.DATABASE_URL);
    honeypotAdapter = getAdapter(userConfig.database, process.env.HONEYPOT_DATABASE_URL);
    
    if (!adapter || !honeypotAdapter) {
      throw new Error("Missing database connection strings in .env file.");
    }
    
    await adapter.connect();
    console.log(`✅ Successfully connected to REAL ${userConfig.database.type} database.`);
    
    await honeypotAdapter.connect();
    console.log(`🍯 Successfully connected to HONEYPOT ${userConfig.database.type} database.`);
    // ------------------------------------

    server.listen(port, () => {
      console.log(`Test server running at http://localhost:${port}`);
      // ... (rest of log messages) ...
    });
  } catch (err) {
    console.error("Failed to connect to databases or start server.", err);
    process.exit(1);
  }
}

startServer();