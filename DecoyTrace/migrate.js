require('dotenv').config();
const { faker } = require('@faker-js/faker');
const crypto = require('crypto');
const userConfig = require('./user_config.json');
const logicConfig = require('./decoy_config.json');

// --- HMAC Helper ---
// We ONLY use the REAL_KEY for this script.
const REAL_KEY = process.env.REAL_SECRET_KEY;
if (!REAL_KEY) {
  console.error("Error: REAL_SECRET_KEY not found in .env file.");
  process.exit(1);
}
function createHmac(data, key) {
  return crypto.createHmac('sha256', key).update(data.toString()).digest('hex');
}
// -------------------

// --- Adapter Helper ---
function getAdapter(dbConfig) {
  const dbType = dbConfig.type.toLowerCase();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("Error: DATABASE_URL not found in .env file.");
    process.exit(1);
  }
  try {
    const Adapter = require(`./adapters/${dbType}Adapter`);
    return new Adapter(connectionString);
  } catch (error) {
    console.error(`Error: Could not load adapter for database type "${dbType}".`);
    process.exit(1);
  }
}
// -------------------

// --- Faker Helper ---
function getFakerMethod(methodString, fakerMap) {
  let [category, method] = methodString.split('.');
  if (faker[category] && faker[category][method]) {
    return faker[category][method];
  }
  const fakerMethodPath = fakerMap[methodString];
  if (fakerMethodPath) {
    [category, method] = fakerMethodPath.split('.');
    if (faker[category] && faker[category][method]) {
      return faker[category][method];
    }
  }
  console.warn(`Invalid Faker Method or Type: ${methodString}.`);
  return () => `[Invalid: ${methodString}]`;
}
// -------------------

// --- Main Execution ---
async function main() {
  console.log("Starting Real Data Migration...");
  const adapter = getAdapter(userConfig.database);
  
  const { fakerMap, strategy } = logicConfig;
  const { identifierType } = strategy;
  const targets = userConfig.collections || userConfig.tables || [];

  // Get the function to generate new IDs
  const getNewId = getFakerMethod(identifierType, fakerMap);

  try {
    await adapter.connect();

    // Loop over ALL targets defined by the user
    for (const target of targets) {
      console.log(`Processing target: "${target.name}"...`);
      
      // Pass the target (which may contain the primaryKey) to the adapter
      const count = await adapter.migrate(target, strategy, REAL_KEY, getNewId, createHmac);
      
      if (count > 0) {
        console.log(`Successfully signed ${count} real records in "${target.name}".`);
      } else {
        console.log(`No unsigned records found in "${target.name}".`);
      }
    }

  } catch (err) {
    console.error("An error occurred during the migration process:", err);
  } finally {
    await adapter.disconnect();
    console.log("Migration complete. Connection closed.");
  }
}

main();