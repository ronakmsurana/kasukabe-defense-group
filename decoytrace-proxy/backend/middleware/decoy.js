
import { decoyIdSet } from './db.js';
import { addIPToJail } from './jail.js';
// Import your alert service (Slack, Socket.IO)
 import { sendAlert } from './alertService.js'; 

export function checkDecoy(req, res, next) {
  // Only check routes that have an :id parameter
  if (req.params.id && decoyIdSet.has(req.params.id)) {
    // ATTACKER DETECTED
    // They are querying for a "trigger" decoy in the REAL database.
    
    // 1. Send the Alert (Async)
    console.log(`[ALERT] 🚨 Attacker at ${req.ip} hit decoy ${req.params.id}`);
    // sendAlert(req.ip, `Decoy ${req.params.id} was accessed!`);
    
    // 2. Add them to JAIL
    addIPToJail(req.ip); 
    
    // 3. Serve the fake data (the honeypot trap)
    // This makes the attacker think they were successful.
    return res.json({
      _id: req.params.id,
      firstName: 'Admin',
      lastName: 'Backup',
      email: 'admin_backup@internal-demo.com',
      jobTitle: 'IT Systems Administrator',
      // ...etc
    });
  }
  
  // This is an innocent user (or a jailed one).
  // Let them pass to the main route handler.
  next();
}