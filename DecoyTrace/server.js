require('dotenv').config();
const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require("socket.io");
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser'); 
const session = require('express-session'); 

// Your custom modules
const userConfig = require('./user_config.json');
const breachProtocol = require('./breachProtocol');
const decoyMiddleware = require('./decoyMiddleware');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
breachProtocol.init(io);

const port = 3000;

// --- Database Adapters ---
let adapter; // For REAL data
let honeypotAdapter; // For FAKE data

// --- Middlewares ---
app.use(express.json()); // Body parser for JSON
app.use(bodyParser.urlencoded({ extended: true })); // <-- NEW: Body parser for form data
app.use(cookieParser());

// --- NEW: Session Middleware Setup ---
app.use(session({
  secret: process.env.SESSION_SECRET || 'a-fallback-secret-key', // Use a key from .env!
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // Set to true if using HTTPS
}));
// ------------------------------------

// --- (getAdapter, sendHoneypot, honeypotFirewall functions are the same) ---
// ... (paste your getAdapter, sendHoneypot, and honeypotFirewall functions here) ...
// -----------------------------------------------------------------
// Adapter Loader
// -----------------------------------------------------------------
function getAdapter(dbConfig, connectionString) {
  const dbType = dbConfig.type.toLowerCase();
  if (!connectionString) {
    console.error(`Error: Connection string is missing for DB type "${dbType}".`);
    return null; 
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
// Centralized Honeypot Function
// -----------------------------------------------------------------
async function sendHoneypot(req, res, ip, reason, sendFunction = null) {
  console.log(`[FIREWALL]: 🛑 ${reason}. Rerouting IP: ${ip} to honeypot.`);
  
  const urlParts = req.originalUrl.split('/');
  const targetName = urlParts[2];
  
  if (!targetName || !honeypotAdapter) {
    const payload = JSON.stringify([{ "message": "Data retrieved successfully" }]);
    if (sendFunction) sendFunction(payload);
    else res.status(200).json(JSON.parse(payload));
    return;
  }

  try {
    const fakeData = await honeypotAdapter.find(targetName);
    const payload = JSON.stringify(fakeData);
    if (sendFunction) {
      res.status(200);
      sendFunction(payload);
    } else {
      res.status(200).json(fakeData);
    }
  } catch (err) {
    console.error(`[HONEYPOT]: Error fetching fake data: ${err.message}`);
    const payload = JSON.stringify([{ "id": "fake-001", "status": "ok" }]);
    if (sendFunction) sendFunction(payload);
    else res.status(200).json(JSON.parse(payload));
  }
  return;
}

// -----------------------------------------------------------------
// Honeypot Firewall (Runs first)
// -----------------------------------------------------------------
const honeypotFirewall = (req, res, next) => {
  if (breachProtocol.ipBlacklist.has(req.ip)) {
    sendHoneypot(req, res, req.ip, "Blacklisted IP");
    return;
  }
  next();
};
app.use(honeypotFirewall);

// -----------------------------------------------------------------
// INITIALIZE & USE DECOYTRACE MIDDLEWARE
// -----------------------------------------------------------------
app.use('/api', decoyMiddleware.init({
  // This is the "minimal change" function you provide.
  // It tells DecoyTrace how to find the user's role from the request.
  roleExtractor: (req) => req.cookies?.auth_role
}));
// -----------------------------------------------------------------
// UPDATED: DEMO LOGIN/LOGOUT ROUTES
// -----------------------------------------------------------------

// This route serves the HTML login form
app.get('/login', (req, res) => {
  res.send(`
    <style>
      body { font-family: sans-serif; background: #222; color: #eee; padding: 20px; display: grid; place-items: center; min-height: 90vh; }
      form { background: #333; padding: 30px; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.5); }
      div { margin-bottom: 15px; }
      label { display: block; margin-bottom: 5px; font-weight: 600; }
      input { width: 300px; padding: 10px; border-radius: 4px; border: 1px solid #555; background: #444; color: #fff; }
      button { width: 100%; padding: 10px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; }
    </style>
    <body>
      <form action="/login" method="POST">
        <h2>Admin Login</h2>
        <div>
          <label for="username">Username:</label>
          <input type="text" id="username" name="username" value="admin">
        </div>
        <div>
          <label for="password">Password:</label>
          <input type="password" id="password" name="password" value="password123">
        </div>
        <button type="submit">Login</button>
      </form>
    </body>
  `);
});

// This route handles the form submission
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (username === 'admin' && password === 'password123') {
    // --- NEW: Set the role in the server-side session ---
    req.session.role = 'admin';
    // --------------------------------------------------
    // We no longer need to set a separate cookie
    res.redirect('/dashboard');
  } else {
    res.send(`... Invalid Credentials ...`);
  }
});

// Handle logout
app.get('/logout', (req, res) => {
  // --- NEW: Destroy the server-side session ---
  req.session.destroy((err) => {
    if (err) {
      console.error("Error destroying session:", err);
      return res.status(500).send("Logout failed.");
    }
    // We also clear the old cookie just in case
    res.clearCookie('auth_role');
    res.redirect('/login');
  });
  // -----------------------------------------
});

// -----------------------------------------------------------------
// API ROUTES (No changes needed)
// -----------------------------------------------------------------
// -----------------------------------------------------------------
// API ROUTES
// -----------------------------------------------------------------

// This single route handles ALL data fetching
app.get('/api/:target', async (req, res) => {
  const targetName = req.params.target;
  
  if (!adapter) {
    return res.status(500).json({ error: "Database not connected" });
  }

  console.log(`\n[APP]: Request for ALL "${targetName}". Fetching from LIVE database...`);
  
  try {
    const data = await adapter.find(targetName);
    res.json(data); // This will be intercepted by decoyMiddleware
    console.log('[APP]: Data sent to user.');
  
  } catch (err) {
    console.error(`[APP]: Error fetching data for target "${targetName}":`, err.message);
    res.status(500).json({ error: "Failed to fetch data." });
  }
});

// This route handles data creation
app.post('/api/:target', async (req, res) => {
  const targetName = req.params.target;
  const newData = req.body; // This body was already signed by decoyMiddleware

  console.log(`[APP]: Received new data for ${targetName}.`);
  
  try {
    // A real app would save this to the database
    // await adapter.insert(targetName, [newData]);
    console.log('[APP]: Data that would be saved (note the signed fields):');
    console.log(newData);
    res.status(201).json({ success: true, data: newData });
  } catch (err) {
    res.status(500).json({ error: "Failed to save data." });
  }
});

// Route for the dashboard
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});
// -----------------------------------------------------------------
// Start Server and Connect to DBs
// -----------------------------------------------------------------
async function startServer() {
  try {
    // ... (same connection logic) ...
    adapter = getAdapter(userConfig.database, process.env.DATABASE_URL);
    honeypotAdapter = getAdapter(userConfig.database, process.env.HONEYPOT_DATABASE_URL);
    
    if (!adapter || !honeypotAdapter) { throw new Error("Missing database connection strings in .env file."); }
    
    await adapter.connect();
    console.log(`✅ Successfully connected to REAL ${userConfig.database.type} database.`);
    
    await honeypotAdapter.connect();
    console.log(`🍯 Successfully connected to HONEYPOT ${userConfig.database.type} database.`);

    // Start the server
    server.listen(port, () => {
      console.log(`Test server running at http://localhost:${port}`);
      console.log('---');
      console.log(`➡️  LIVE DASHBOARD: http://localhost:${port}/dashboard`);
      console.log(`➡️  DEMO LOGIN: http://localhost:${port}/login`);
      console.log('---');
      const targets = userConfig.collections || userConfig.tables || [];
      targets.forEach(t => { console.log(`   http://localhost:${port}/api/${t.name}`); });
      console.log('---');
    });

  } catch (err) {
    console.error("Failed to connect to databases or start server.", err);
    process.exit(1);
  }
};
startServer();
