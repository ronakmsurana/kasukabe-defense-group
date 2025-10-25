// This Set will store the IPs of known attackers.
// For a real app, this would be a high-speed database like Redis.
// For the hackathon, an in-memory Set is fast and effective.
const ipBlacklist = new Set();

/**
 * Triggers the breach response: logs the alert and blacklists the IP.
 * @param {object} requestInfo - Details about the attacker's request (IP, URL, etc.)
 * @param {object} decoyRecord - The specific decoy record that was accessed.
 */
const triggerAlert = (requestInfo, decoyRecord) => {
  console.log('---');
  console.error(`🚨 !!!! BREACH DETECTED !!!! 🚨`);
  console.error(`Decoy data accessed by IP: ${requestInfo.ip}`);
  console.error(`Request: ${requestInfo.method} ${requestInfo.url}`);
  
  // NEW: Show what data was stolen
  console.error('Data Stolen:');
  console.warn(JSON.stringify(decoyRecord, null, 2)); // Pretty-print the decoy object
  
  // Add the IP to the blacklist
  ipBlacklist.add(requestInfo.ip);
  
  console.error(`Action: IP ${requestInfo.ip} has been added to the blacklist.`);
  console.log('---');
};

// Export the functions for server.js to use
module.exports = {
  triggerAlert,
  ipBlacklist, // We export this so Step 4 can read it
};