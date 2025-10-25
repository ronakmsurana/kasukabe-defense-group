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

// --- NEW: Global adapter variable ---
let adapter;

// -----------------------------------------------------------------
// NEW: Adapter Loader (copied from planter.js)
// -----------------------------------------------------------------
function getAdapter(dbConfig) {
  const dbType = dbConfig.type.toLowerCase();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("Error: DATABASE_URL not found in .env file.");
    process.exit(1);
  }
  try {
    const Adapter = require(`./adapters/${dbType}Adapter`);
    return new Adapter(connectionString);
  } catch (error) {
    console.error(`Error: Could not load adapter for database type "${dbType}".`);
    process.exit(1);
  }
}

// --- NEW: Centralized Honeypot Response ---
function sendHoneypot(res, ip, reason) {
  console.log(`[FIREWALL]: 🛑 ${reason}. Denied IP: ${ip}`);
  // Send a generic error, not an obvious honeypot
  res.status(403).json({ "message": "Access Forbidden" });
  return;
}

// -----------------------------------------------------------------
// STEP 4: THE HONEYPOT FIREWALL (No change)
// -----------------------------------------------------------------
const honeypotFirewall = (req, res, next) => {
  if (breachProtocol.ipBlacklist.has(req.ip)) {
    console.log(`[FIREWALL]: 🛑 Denied blacklisted IP: ${req.ip}`);
    res.status(200).json({ "message": "Access denied" }); // Simple honeypot
    return;
  }
  next();
};
app.use(honeypotFirewall);

// -----------------------------------------------------------------
// Load Secrets & Config (No change)
// -----------------------------------------------------------------
const DECOY_KEY = process.env.DECOY_SECRET_KEY;
const ADMIN_BYPASS_KEY = process.env.ADMIN_BYPASS_KEY;
const { identifierField, hmacField } = logicConfig.strategy;
if (!DECOY_KEY || !identifierField || !hmacField) {
  console.error("Error: Missing keys or strategy in config/env.");
  process.exit(1);
}

// --- NEW: Load Heuristics ---
// Default to 5MB if not set
const MAX_DATA_BYTES = logicConfig.heuristics?.maxDataBytes || 5242880;

// -----------------------------------------------------------------
// HMAC HELPER FUNCTION (No change)
// -----------------------------------------------------------------
function createHmac(data, key) {
  return crypto.createHmac('sha256', key).update(data.toString()).digest('hex');
}

// -----------------------------------------------------------------
// STEP 2: ASYNCHRONOUS HMAC CHECK (No change)
// -----------------------------------------------------------------
const checkData = async (data, requestInfo) => {
  // ... (This function is identical to before) ...
  let records = [];
  if (Array.isArray(data)) records = data;
  else if (typeof data === 'object' && data !== null) records = [data];
  if (records.length === 0) return;
  for (const record of records) {
    if (record && record[identifierField] && record[hmacField]) {
      const uniqueId = record[identifierField];
      const dataCode = record[hmacField];
      const testHash = createHmac(uniqueId, DECOY_KEY);
      if (testHash === dataCode) {
        breachProtocol.triggerAlert(requestInfo, record);
        return;
      }
    }
  }
};

// -----------------------------------------------------------------
// STEP 1: THE INTERCEPTOR MIDDLEWARE (No change)
// -----------------------------------------------------------------
const decoyInterceptor = (req, res, next) => {
  // ... (This function is identical to before) ...
  // --- NEW BYPASS LOGIC ---
  const bypassHeader = req.headers['x-admin-bypass'];
  if (ADMIN_BYPASS_KEY && bypassHeader === ADMIN_BYPASS_KEY) {
    // This is a trusted admin. Skip ALL decoy logic.
    return next();
  }
  const originalSend = res.send.bind(res);
  res.send = (body) => {
    // --- NEW: HEURISTIC CHECK (Synchronous) ---
    // Check the size of the response body *before* sending.
    if (body && body.length > MAX_DATA_BYTES) {
      console.warn(`[HEURISTIC]: Large data request detected from IP: ${req.ip}. Size: ${body.length} bytes.`);
      
      const requestInfo = {
        ip: req.ip,
        url: req.originalUrl,
        method: req.method,
      };

      // 1. Trigger alert and blacklist (pass 'null' for decoy)
      breachProtocol.triggerAlert(requestInfo, null); 
      
      // 2. Send honeypot *instead* of the real data
      sendHoneypot(res, req.ip, "Large data request");
      return; // Stop here! Do not send the data.
    }
    // --- END HEURISTIC CHECK ---

    // If check passed, send data and check HMAC asynchronously
    originalSend(body);
    try {
      const requestInfo = { ip: req.ip, url: req.originalUrl, method: req.method };
      const data = JSON.parse(body);
      checkData(data, requestInfo);
    } catch (e) { /* Not JSON, skip */ }
  };
  next();
};
// Apply the interceptor to ALL /api routes
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

// Route for the dashboard HTML
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// -----------------------------------------------------------------
// Start Server and Connect to DB
// -----------------------------------------------------------------
async function startServer() {
  try {
    // --- NEW: Use the adapter to connect ---
    adapter = getAdapter(userConfig.database);
    await adapter.connect();
    console.log(`Successfully connected to ${userConfig.database.type} database.`);
    // ------------------------------------

    // Start the Express server
    server.listen(port, () => {
      console.log(`Test server running at http://localhost:${port}`);
      console.log('---');
      console.log(`➡️  LIVE DASHBOARD: http://localhost:${port}/dashboard`);
      console.log('---');
      console.log('➡️  Test a REAL attack on your configured targets:');
      const targets = userConfig.collections || userConfig.tables || [];
      targets.forEach(t => {
        console.log(`   http://localhost:${port}/api/${t.name}`);
      });
      console.log('---');
    });
  } catch (err) {
    console.error("Failed to connect to database or start server.", err);
    process.exit(1);
  }
}

startServer();