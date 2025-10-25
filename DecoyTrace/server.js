require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const logicConfig = require('./decoy_config.json');
// UPDATED: We now import the 'ipBlacklist' as well
const breachProtocol = require('./breachProtocol'); 

const app = express();
const port = 3000;

// -----------------------------------------------------------------
// STEP 4: THE HONEYPOT FIREWALL (NEW)
// -----------------------------------------------------------------
// This middleware MUST be applied BEFORE any other routes or interceptors.
const honeypotFirewall = (req, res, next) => {
  // Check if the request's IP is in our blacklist
  if (breachProtocol.ipBlacklist.has(req.ip)) {
    // 1. Log that we caught the attacker
    console.log(`[FIREWALL]: 🛑 Denied blacklisted IP: ${req.ip}`);
    
    // 2. Stop the request and send fake "honeypot" data
    // This data looks real but is completely fabricated.
    res.status(200).json({
      "data": [
        { "id": "emp-fake-101", "name": "Alice Anderson", "status": "Active" },
        { "id": "emp-fake-102", "name": "Bob Brown", "status": "Active" }
      ],
      "message": "Data retrieved successfully."
    });
    
    // 3. IMPORTANT: Stop any further processing
    return; 
  }
  
  // 4. If the IP is clean, let the request continue to the real app
  next();
};

// --- APPLY THE FIREWALL FIRST ---
app.use(honeypotFirewall);

// -----------------------------------------------------------------
// Load Secrets & Config
// -----------------------------------------------------------------
const DECOY_KEY = process.env.DECOY_SECRET_KEY;
const REAL_KEY = process.env.REAL_SECRET_KEY;

if (!DECOY_KEY || !REAL_KEY) {
  console.error("Error: DECOY_SECRET_KEY or REAL_SECRET_KEY not found in .env file.");
  process.exit(1);
}

const { identifierField, hmacField } = logicConfig.strategy;
if (!identifierField || !hmacField) {
  console.error("Error: 'strategy' not found in decoy_config.json.");
  process.exit(1);
}

// -----------------------------------------------------------------
// HMAC HELPER FUNCTION
// -----------------------------------------------------------------
function createHmac(data, key) {
  return crypto.createHmac('sha256', key).update(data.toString()).digest('hex');
}

// -----------------------------------------------------------------
// STEP 2: ASYNCHRONOUS HMAC CHECK
// -----------------------------------------------------------------
const checkData = async (data, requestInfo) => {
  let records = [];
  if (Array.isArray(data)) {
    records = data;
  } else if (typeof data === 'object' && data !== null) {
    records = [data];
  }

  if (records.length === 0) {
    return; 
  }

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
// STEP 1: THE INTERCEPTOR MIDDLEWARE
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
    } catch (e) {
      // Not JSON, skip.
    }
  };
  next();
};

// -----------------------------------------------------------------
// MOCK API
// -----------------------------------------------------------------

// Apply the interceptor *after* the firewall
app.use('/api', decoyInterceptor);

// --- Mock data generation ---
const realUser = {
  _id: '68fcbf538c93375447b1d423',
  firstName: 'Shinnosuke',
  is_decoy: false,
  [identifierField]: 'a-real-uuid-1',
  [hmacField]: createHmac('a-real-uuid-1', REAL_KEY), 
};
const decoyUser = {
  _id: '68fcbf538c93375447b1d424',
  firstName: 'Fake',
  lastName: 'User',
  is_decoy: true,
  [identifierField]: 'a-decoy-uuid-2',
  [hmacField]: createHmac('a-decoy-uuid-2', DECOY_KEY),
};

const getMockEmployees = async (isDecoy) => {
  if (isDecoy) {
    return [decoyUser];
  }
  return [realUser, decoyUser];
};

app.get('/api/employees', async (req, res) => {
  console.log('\n[APP]: Request for ALL employees. Fetching data...');
  const employees = await getMockEmployees(false);
  res.json(employees);
  console.log('[APP]: Data sent to user.');
});

app.get('/api/employees/decoy', async (req, res) => {
  console.log('\n[APP]: Request for ONE employee (a decoy). Fetching data...');
  const employees = await getMockEmployees(true);
  res.json(employees);
  console.log('[APP]: Data sent to user.');
});

// Start the server
app.listen(port, () => {
  console.log(`Test server running at http://localhost:${port}`);
  console.log('---');
  console.log('Test 1 (Breach): http://localhost:3000/api/employees');
  console.log('Test 2 (Honeypot): Refresh that same URL.');
  console.log('---');
});