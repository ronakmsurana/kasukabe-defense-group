require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const { MongoClient } = require('mongodb'); // <-- NEW: Import the real MongoDB client
const logicConfig = require('./decoy_config.json');
const breachProtocol = require('./breachProtocol');

const app = express();
const port = 3000;

// -----------------------------------------------------------------
// Database Connection
// -----------------------------------------------------------------
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("Error: DATABASE_URL not found in .env file.");
  process.exit(1);
}
const client = new MongoClient(DATABASE_URL);
let employeesCollection; // This will hold our connection

// -----------------------------------------------------------------
// STEP 4: THE HONEYPOT FIREWALL (No change)
// -----------------------------------------------------------------
const honeypotFirewall = (req, res, next) => {
  if (breachProtocol.ipBlacklist.has(req.ip)) {
    console.log(`[FIREWALL]: 🛑 Denied blacklisted IP: ${req.ip}`);
    res.status(200).json({
      "data": [
        { "id": "emp-fake-101", "name": "Alice Anderson", "status": "Active" },
        { "id": "emp-fake-102", "name": "Bob Brown", "status": "Active" }
      ],
      "message": "Data retrieved successfully."
    });
    return;
  }
  next();
};
app.use(honeypotFirewall);

// -----------------------------------------------------------------
// Load Secrets & Config (No change)
// -----------------------------------------------------------------
const DECOY_KEY = process.env.DECOY_SECRET_KEY;
const { identifierField, hmacField } = logicConfig.strategy;
// ... (rest of config loading is the same) ...
if (!DECOY_KEY || !identifierField || !hmacField) {
  console.error("Error: Missing keys or strategy in config/env.");
  process.exit(1);
}

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
  let records = [];
  if (Array.isArray(data)) {
    records = data;
  } else if (typeof data === 'object' && data !== null) {
    records = [data];
  }
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
  const originalSend = res.send.bind(res);
  res.send = (body) => {
    originalSend(body);
    try {
      const requestInfo = {
        ip: req.ip,
        url: req.originalUrl,
        method: req.method,
      };
      const data = JSON.parse(body);
      checkData(data, requestInfo);
    } catch (e) { /* Not JSON, skip */ }
  };
  next();
};
app.use('/api', decoyInterceptor);

// -----------------------------------------------------------------
// LIVE API ROUTES
// -----------------------------------------------------------------

// This route simulates an attacker stealing ALL data
app.get('/api/employees', async (req, res) => {
  if (!employeesCollection) {
    return res.status(500).json({ error: "Database not connected" });
  }

  console.log('\n[APP]: Request for ALL employees. Fetching from LIVE database...');
  
  // THIS IS THE ONLY CHANGE:
  // We now call the REAL database, not getMockEmployees
  const employees = await employeesCollection.find({}).toArray();
  
  res.json(employees);
  console.log('[APP]: Data sent to user.');
});

// -----------------------------------------------------------------
// Start Server and Connect to DB
// -----------------------------------------------------------------
async function startServer() {
  try {
    // Connect to MongoDB Atlas
    await client.connect();
    // Get the database and collection from your user_config.json
    // Make sure these names are correct!
    const db = client.db('db_real'); 
    employeesCollection = db.collection('employees'); 

    console.log("Successfully connected to MongoDB Atlas.");

    // Start the Express server
    app.listen(port, () => {
      console.log(`Test server running at http://localhost:${port}`);
      console.log('---');
      console.log('Test the REAL attack: http://localhost:3000/api/employees');
      console.log('Then, REFRESH the page to test the honeypot.');
      console.log('---');
    });
  } catch (err) {
    console.error("Failed to connect to database or start server.", err);
    process.exit(1);
  }
}

startServer();