// backend/middleware/jail.js
export function createJail(adapter) {
  const jailedIPs = new Set();

  const addIPToJail = (ip) => {
    if (!jailedIPs.has(ip)) {
      console.log(`[JAIL] ⛓️  Adding IP ${ip} to jail.`);
      jailedIPs.add(ip);
    }
  };

  const jailRouter = (req, res, next) => {
    // Note: req.ip might need proxy configuration in a real app
    const ip = req.ip; 
    
    if (jailedIPs.has(ip)) {
      req.db = adapter.fake;
      console.log(`[JAIL] Request from ${ip} rerouted to FAKE DB.`);
    } else {
      req.db = adapter.real;
    }
    next();
  };
  
  return { addIPToJail, jailRouter };
}