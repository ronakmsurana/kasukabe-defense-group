// index.js
import express from 'express';
import 'dotenv/config';

// 1. Import Adapters
import { MongoAdapter } from './backend/adapters/MongoAdapter.js';
import { MySqlAdapter } from './backend/adapters/MySqlAdapter.js';

// 2. Import Middleware Factories
import { createJail } from './backend/middleware/jail.js';
import { createDecoyMiddleware } from './backend/middleware/decoyMiddleware.js';

const app = express();
const PORT = process.env.PORT || 4000;
app.set('trust proxy', true); // To get the real req.ip

// --- 3. The "Switcher" ---
const DB_TYPE = process.env.DB_TYPE;
let adapter;

if (DB_TYPE === 'mysql') {
  adapter = MySqlAdapter;
  console.log('Booting with MySQL Adapter');
} else {
  adapter = MongoAdapter;
  console.log('Booting with MongoDB Adapter');
}

(async () => {
  // 4. Initialize Everything
  await adapter.loadDecoys();
  
  const { addIPToJail, jailRouter } = createJail(adapter);
  const { checkDecoy } = createDecoyMiddleware(adapter, addIPToJail);

  // 5. Apply Middleware Chain
  app.use('/api', jailRouter); // The Jailer runs first

  // --- 6. API Routes (Now 100% Generic) ---
  
  // Get all employees
  app.get('/api/employees', async (req, res) => {
    try {
      const employees = await req.db.getAllEmployees(); 
      res.json(employees);
    } catch (e) {
      res.status(500).send(e.message);
    }
  });
  
  // Get one employee (protected by checkDecoy)
  app.get('/api/employees/:id', checkDecoy, async (req, res) => {
    try {
      const employee = await req.db.getEmployeeById(req.params.id); 
      if (!employee) return res.status(404).send('Employee not found');
      res.json(employee);
    } catch (e) {
      res.status(500).send(e.message);
    }
  });

  app.listen(PORT, () => {
    console.log(`✅ DecoyTrace Proxy running on http://localhost:${PORT}`);
  });
})();
