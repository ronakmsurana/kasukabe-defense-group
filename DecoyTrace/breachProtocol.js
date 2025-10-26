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
 * Triggers the breach response
 * @param {object} requestInfo - Details about the attacker's request
 * @param {object} stolenDataPayload - The full data payload that was breached.
 * @param {string} threatLevel - 'high' (red) or 'low' (yellow)
 */
const triggerAlert = (requestInfo, stolenDataPayload, threatLevel = 'high') => {
  console.log('---'); // Log separator at the beginning

  const alertDetails = {
    ip: requestInfo.ip,
    url: requestInfo.url,
    method: requestInfo.method,
    timestamp: new Date().toISOString(),
    stolenData: stolenDataPayload,
    threatLevel: threatLevel
  };

  // Emit the event to the dashboard regardless of threat level
  if (io) {
    io.emit('breach', alertDetails);
  }

  // --- High Threat Response ---
  if (threatLevel === 'high') {
    console.error(`🚨 !!!! HIGH THREAT DETECTED !!!! 🚨`);
    console.error(`Attacker IP: ${requestInfo.ip}`);
    console.error(`Request: ${requestInfo.method} ${requestInfo.url}`);

    // Log stolen data ONLY for high threats
    if (stolenDataPayload) {
      const recordCount = Array.isArray(stolenDataPayload) ? stolenDataPayload.length : 1;
      console.error(`Type: Decoy detected in payload of ${recordCount} records.`);
      console.warn('Full Data Payload Stolen:');
      console.warn(JSON.stringify(stolenDataPayload, null, 2));
    } else {
      console.error('Type: Heuristic violation (large data request)');
    }

    // Blacklist ONLY for high threats
    if (!ipBlacklist.has(requestInfo.ip)) {
      ipBlacklist.add(requestInfo.ip);
      console.error(`Action: IP ${requestInfo.ip} has been added to the blacklist.`);
      // saveBlacklist(); // Uncomment if using persistent blacklist
    } else {
      console.log(`[BLACKLIST]: IP ${requestInfo.ip} is already blacklisted.`);
    }

  // --- Low Threat Response ---
  } else if (threatLevel === 'low') {
    console.warn(`🔶 ---- LOW THREAT AUDIT ---- 🔶`);
    console.warn(`Admin Bypass Used by IP: ${requestInfo.ip}`);
    console.warn(`Request: ${requestInfo.method} ${requestInfo.url}`);
    // Do NOT log stolen data or blacklist for low threats
  }

  console.log('---'); // Log separator at the end
};
 

module.exports = {
  init, // <-- NEW
  triggerAlert,
  ipBlacklist,
};