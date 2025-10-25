const ipBlacklist = new Set();

// --- NEW: A variable to hold the socket.io server ---
let io = null;

/**
 * NEW: Initializes the protocol with the socket.io server
 * @param {object} socketIo - The socket.io server instance
 */
const init = (socketIo) => {
  io = socketIo;
  console.log('Breach protocol initialized with real-time dashboard service.');
};
// ----------------------------------------------------

/**
 * Triggers the breach response: logs, blacklists, and alerts the dashboard.
 * @param {object} requestInfo - Details about the attacker's request
 * @param {object} decoyRecord - The specific decoy record that was accessed.
 */
const triggerAlert = (requestInfo, decoyRecord) => {
  console.log('---');
  console.error(`🚨 !!!! BREACH DETECTED !!!! 🚨`);
  console.error(`Decoy data accessed by IP: ${requestInfo.ip}`);
  console.error(`Request: ${requestInfo.method} ${requestInfo.url}`);
  
  // Create a clean object for the dashboard
  const alertDetails = {
    ip: requestInfo.ip,
    url: requestInfo.url,
    method: requestInfo.method,
    timestamp: new Date().toISOString(),
    stolenData: decoyRecord
  };
  
  // --- NEW: Check if this was an HMAC or Heuristic breach ---
  if (decoyRecord) {
    console.error('Type: Decoy HMAC match');
    console.error('Data Stolen:');
    console.warn(JSON.stringify(decoyRecord, null, 2));
  } else {
    // This is a heuristic breach
    console.error('Type: Heuristic violation (e.g., large data request)');
    alertDetails.stolenData = { "error": "Heuristic violation, data not sent." };
  }
  // ---------------------------------------------------------

  // --- NEW: Emit the event to the dashboard ---
  if (io) {
    io.emit('breach', alertDetails);
  }
  // --------------------------------------------

  console.error('Data Stolen:');
  console.warn(JSON.stringify(decoyRecord, null, 2));
  
  ipBlacklist.add(requestInfo.ip);
  
  console.error(`Action: IP ${requestInfo.ip} has been added to the blacklist.`);
  console.log('---');
};

module.exports = {
  init, // <-- NEW
  triggerAlert,
  ipBlacklist,
};