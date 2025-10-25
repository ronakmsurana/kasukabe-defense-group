const fs= require('fs');
require('dotenv').config();
const { faker } = require('@faker-js/faker');
const crypto = require('crypto');
const userConfig = require('./user_config.json');
const logicConfig = require('./decoy_config.json');

// --- HMAC Helper ---
// This script ONLY plants decoys, so it ONLY uses the DECOY_KEY.
const DECOY_KEY = process.env.DECOY_SECRET_KEY;
if (!DECOY_KEY) {
  console.error("Error: DECOY_SECRET_KEY not found in .env file.");
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
  // Use methodString directly if it's a faker path like "name.findName"
  let [category, method] = methodString.split('.');
  if (faker[category] && faker[category][method]) {
    return faker[category][method];
  }
  
  // Otherwise, treat it as a data type (e.g., "string") and look it up in the map
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

/**
 * Generates an array of decoy objects for a single target.
 */
function generateDecoys(schemaFields, count, fakerMap, strategy) {
  const { identifierField, hmacField } = strategy;
  const decoys = [];

  // Get our ID generator from the map
  const getNewId = getFakerMethod('uuid', fakerMap);

  for (let i = 0; i < count; i++) {
    const decoyRecord = {};

    // 1. Generate all base data from the USER'S schema fields
    for (const fieldName in schemaFields) {
      const dataTypeOrMethod = schemaFields[fieldName];
      decoyRecord[fieldName] = getFakerMethod(dataTypeOrMethod, fakerMap)();
    }

    // 2. Apply OUR decoy strategy (add new fields)
    const newId = getNewId();
    // We sign this decoy using the DECOY_KEY
    const decoyHash = createHmac(newId, DECOY_KEY);

    decoyRecord[identifierField] = newId;  // e.g., decoyRecord.unique_id = "uuid-..."
    decoyRecord[hmacField] = decoyHash;    // e.g., decoyRecord.data_code = "hmac-..."

    decoys.push(decoyRecord);
  }
  return decoys;
}

// --- Main Execution ---
async function main() {
  console.log("Starting Decoy Planter...");
  const adapter = getAdapter(userConfig.database);
  
  const { countPerTarget, fakerMap, strategy } = logicConfig;
  const targets = userConfig.collections || userConfig.tables;

  if (!targets) {
    console.error("Error: No 'collections' or 'tables' array found in user_config/schema.json.");
    process.exit(1);
  }

  try {
    await adapter.connect();

    // Loop over ALL targets defined by the user
    for (const target of targets) {
      console.log(`Processing target: "${target.name}"...`);
      
      const decoys = generateDecoys(
        target.fields,
        countPerTarget,
        fakerMap,
        strategy
      );
      
      console.log(`Planting ${countPerTarget} decoys into "${target.name}"...`);
      await adapter.insert(target.name, decoys, strategy); 

      console.log(`Successfully planted decoys in "${target.name}".`);
    }

  } catch (err) {
    console.error("An error occurred during the planting process:", err);
  } finally {
    await adapter.disconnect();
    console.log("Decoy planting complete. Connection closed.");
  }
}

main();