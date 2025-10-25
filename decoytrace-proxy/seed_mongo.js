// plant-decoys-mongo.js
import mongoose from 'mongoose';
import 'dotenv/config.js'; 
// Define the schema (must match your adapter)
const EmployeeSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  email: String,
  jobTitle: String,
  department: String,
  is_decoy: { type: Boolean, default: false }
});

// The decoys to plant
const decoyTriggers = [
  {
    firstName: 'Admin',
    lastName: 'Backup',
    email: 'admin_backup@internal-demo.com',
    jobTitle: 'IT Systems Administrator',
    department: 'IT',
    is_decoy: true,
  },
  {
    firstName: 'Security',
    lastName: 'Test',
    email: 'security.test@internal-demo.com',
    jobTitle: 'Security Analyst',
    department: 'IT',
    is_decoy: true,
  }
];

// --- The Seeding Function ---
async function plantMongoDecoys() {
  let conn_real;
  
  try {
    console.log(' Connecting to REAL MongoDB to plant decoys...');
    conn_real = mongoose.createConnection(process.env.MONGO_URI_REAL);
    const Employee_Real = conn_real.model('Employee', EmployeeSchema);
    
    // Note: We do NOT wipe the database (no deleteMany)
    
    await Employee_Real.insertMany(decoyTriggers);
    console.log(`[REAL DB] ✅ Planted ${decoyTriggers.length} new decoy records.`);

  } catch (err) {
    console.error(' Error planting decoys:', err.message);
  } finally {
    if (conn_real) await conn_real.close();
    console.log(' Disconnected from MongoDB.');
  }
}

plantMongoDecoys();