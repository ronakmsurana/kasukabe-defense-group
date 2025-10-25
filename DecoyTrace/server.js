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
async function sendHoneypot(req, res, ip, reason) {
  console.log(`[FIREWALL]: 🛑 ${reason}. Rerouting IP: ${ip} to honeypot.`);
  
  // NEW LINE:
  // Manually parse the target from the URL
  const urlParts = req.originalUrl.split('/'); // e.g., ['', 'api', 'employees']
  const targetName = urlParts[2]; // This will be 'employees' or 'products'
  
  if (!targetName || !honeypotAdapter) {
    // Fallback if honeypot isn't working
    return res.status(200).json([{ "message": "Data retrieved successfully" }]);
  }

  try {
    // --- THIS IS THE CORE LOGIC ---
    // Fetch data from the *honeypot* database instead of the real one
    const fakeData = await honeypotAdapter.find(targetName);
    res.status(200).json(fakeData);
    // ----------------------------
  } catch (err) {
    // If honeypot fails (e.g., no 'products' table), send a generic response
    console.error(`[HONEYPOT]: Error fetching fake data: ${err.message}`);
    res.status(200).json([{ "id": "fake-001", "status": "ok" }]);
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
// STEP 1: THE INTERCEPTOR MIDDLEWARE (Updated)
// -----------------------------------------------------------------
const decoyInterceptor = (req, res, next) => {
  const bypassHeader = req.headers['x-admin-bypass'];
  if (ADMIN_BYPASS_KEY && bypassHeader === ADMIN_BYPASS_KEY) {
    return next();
  }

  const originalSend = res.send.bind(res);

  res.send = (body) => {
    // --- HEURISTIC CHECK (Updated) ---
    if (body && body.length > MAX_DATA_BYTES) {
      console.warn(`[HEURISTIC]: Large data request detected from IP: ${req.ip}.`);
      
      const requestInfo = { ip: req.ip, url: req.originalUrl, method: req.method };
      breachProtocol.triggerAlert(requestInfo, null); 
      
      // Call the new honeypot function
      sendHoneypot(req, res, req.ip, "Large data request");
      return; // Stop here!
    }
    // --- END HEURISTIC CHECK ---

    originalSend(body);
    
    try {
      const requestInfo = { ip: req.ip, url: req.originalUrl, method: req.method };
      const data = JSON.parse(body);
      checkData(data, requestInfo); // Async HMAC check
    } catch (e) { /* Not JSON, skip */ }
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