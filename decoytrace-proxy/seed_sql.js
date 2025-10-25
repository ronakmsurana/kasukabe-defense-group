// plant-decoys-mysql.js
import mysql from 'mysql2/promise';
import 'dotenv/config'; // Loads .env file

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

// Helper to convert JS objects to SQL insertion array
function mapToSqlArray(data) {
  return [data.firstName, data.lastName, data.email, data.jobTitle, data.department, data.is_decoy];
}

// --- The Seeding Function ---
async function plantMySqlDecoys() {
  let pool_real;

  try {
    console.log(' Connecting to REAL MySQL to plant decoys...');
    pool_real = mysql.createPool(process.env.MYSQL_URI_REAL);

    // Note: We do NOT wipe or create tables.
    // We assume the 'employees' table already exists.

    const realDataForSql = decoyTriggers.map(mapToSqlArray);
    
    // Bulk insert decoys
    await pool_real.query(
      'INSERT INTO employees (firstName, lastName, email, jobTitle, department, is_decoy) VALUES ?',
      [realDataForSql]
    );
    console.log(`[REAL DB]  Planted ${decoyTriggers.length} new decoy records.`);

  } catch (err) {
    console.error(' Error planting decoys:', err.message);
  } finally {
    if (pool_real) await pool_real.end();
    console.log(' Disconnected from MySQL.');
  }
}

plantMySqlDecoys();