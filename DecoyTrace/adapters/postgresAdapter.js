const { Client } = require('pg');

class PostgresAdapter {
  constructor(connectionString) {
    this.client = new Client({ connectionString });
  }

  async connect() {
    try {
      await this.client.connect();
      console.log("Successfully connected to PostgreSQL.");
    } catch (error) {
      console.error("Failed to connect to PostgreSQL:", error);
      throw error;
    }
  }

  // Ensures the required columns exist before inserting
  async ensureColumns(tableName, strategy) {
    const { identifierField, hmacField } = strategy;
    // We quote table and column names to handle special characters or keywords
    const query = `
      ALTER TABLE ${JSON.stringify(tableName)}
      ADD COLUMN IF NOT EXISTS ${JSON.stringify(identifierField)} VARCHAR(255),
      ADD COLUMN IF NOT EXISTS ${JSON.stringify(hmacField)} VARCHAR(255);
    `;
    try {
      await this.client.query(query);
    } catch (error) {
      console.error(`Failed to alter table "${tableName}":`, error);
      throw error;
    }
  }

  async insert(tableName, data, strategy) {
    if (!data || data.length === 0) return;
    
    // 1. Ensure columns exist
    await this.ensureColumns(tableName, strategy);

    // 2. Dynamically build the INSERT query
    const keys = Object.keys(data[0]);
    const columns = keys.map(k => JSON.stringify(k)).join(', ');
    
    // Create placeholders like ($1, $2, $3), ($4, $5, $6)
    let placeholderIndex = 1;
    const valuePlaceholders = data.map(() => {
      const rowPlaceholders = keys.map(() => `$${placeholderIndex++}`).join(', ');
      return `(${rowPlaceholders})`;
    }).join(', ');
    
    // Flatten all values into a single array
    const allValues = data.flatMap(row => keys.map(key => row[key]));
    
    const query = `
      INSERT INTO ${JSON.stringify(tableName)} (${columns}) 
      VALUES ${valuePlaceholders}
    `;

    // 3. Execute the query
    try {
      await this.client.query(query, allValues);
    } catch (error) {
      console.error(`Failed to insert data into table "${tableName}":`, error);
      throw error;
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.end();
      console.log("PostgreSQL connection closed.");
    }
  }
// UPDATED: Extracted from 'insert'
  async ensureColumns(tableName, strategy) {
    const { identifierField, hmacField } = strategy;
    const query = `
      ALTER TABLE ${JSON.stringify(tableName)}
      ADD COLUMN IF NOT EXISTS ${JSON.stringify(identifierField)} VARCHAR(255),
      ADD COLUMN IF NOT EXISTS ${JSON.stringify(hmacField)} VARCHAR(255);
    `;
    try {
      await this.client.query(query);
    } catch (error) {
      console.error(`Failed to alter table "${tableName}":`, error);
      throw error;
    }
  }

  // NEW: Migrates data using 'ctid' row identifier
  async migrate(target, strategy, realKey, getNewId, createHmac) {
    const { name: tableName } = target;
    const { identifierField, hmacField } = strategy;

    await this.ensureColumns(tableName, strategy);

    // 1. Find all rows (using built-in 'ctid') that are not signed
    const selectQuery = `SELECT ctid FROM ${JSON.stringify(tableName)} WHERE ${JSON.stringify(hmacField)} IS NULL`;
    const res = await this.client.query(selectQuery);

    if (res.rowCount === 0) return 0;

    // 2. Loop and update one by one (less efficient, but works)
    let updateCount = 0;
    for (const row of res.rows) {
      const newId = getNewId();
      const newHash = createHmac(newId, realKey);
      const updateQuery = `
        UPDATE ${JSON.stringify(tableName)}
        SET ${JSON.stringify(identifierField)} = $1, ${JSON.stringify(hmacField)} = $2
        WHERE ctid = $3
      `;
      await this.client.query(updateQuery, [newId, newHash, row.ctid]);
      updateCount++;
    }
    return updateCount;
  }

  async find(tableName) {
    if (!this.client) throw new Error("Not connected.");
    
    const query = `SELECT * FROM ${JSON.stringify(tableName)}`;
    const res = await this.client.query(query);
    return res.rows;
  }
}
module.exports = PostgresAdapter;