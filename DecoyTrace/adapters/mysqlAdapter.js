const mysql = require('mysql2/promise');

class MySqlAdapter {
  constructor(connectionString) {
    // mysql2 driver prefers an object or a URL string
    this.connectionString = connectionString;
    this.connection = null;
  }

  async connect() {
    try {
      this.connection = await mysql.createConnection(this.connectionString);
      console.log("Successfully connected to MySQL.");
    } catch (error) {
      console.error("Failed to connect to MySQL:", error);
      throw error;
    }
  }

  async ensureColumns(tableName, strategy) {
    const { identifierField, hmacField } = strategy;
    // MySQL uses `IF NOT EXISTS` for `ADD COLUMN`
    // We use backticks (`) for identifiers in MySQL
    const query = `
      ALTER TABLE \`${tableName}\`
      ADD COLUMN IF NOT EXISTS \`${identifierField}\` VARCHAR(255),
      ADD COLUMN IF NOT EXISTS \`${hmacField}\` VARCHAR(255);
    `;
    try {
      await this.connection.execute(query);
    } catch (error) {
      console.error(`Failed to alter table "${tableName}":`, error);
      throw error;
    }
  }

  async insert(tableName, data, strategy) {
    if (!data || data.length === 0) return;

    await this.ensureColumns(tableName, strategy);

    const keys = Object.keys(data[0]);
    // Use backticks (`) for column names
    const columns = keys.map(k => `\`${k}\``).join(', ');
    
    // Create placeholders like (?, ?, ?), (?, ?, ?)
    const rowPlaceholder = `(${keys.map(() => '?').join(', ')})`;
    const allPlaceholders = data.map(() => rowPlaceholder).join(', ');

    // Flatten all values
    const allValues = data.flatMap(row => keys.map(key => row[key]));

    const query = `
      INSERT INTO \`${tableName}\` (${columns}) 
      VALUES ${allPlaceholders}
    `;

    try {
      await this.connection.query(query, allValues);
    } catch (error) {
      console.error(`Failed to insert data into table "${tableName}":`, error);
      throw error;
    }
  }

  async disconnect() {
    if (this.connection) {
      await this.connection.end();
      console.log("MySQL connection closed.");
    }
  }
// UPDATED: Extracted from 'insert'
  async ensureColumns(tableName, strategy) {
    const { identifierField, hmacField } = strategy;
    const query = `
      ALTER TABLE \`${tableName}\`
      ADD COLUMN IF NOT EXISTS \`${identifierField}\` VARCHAR(255),
      ADD COLUMN IF NOT EXISTS \`${hmacField}\` VARCHAR(255);
    `;
    await this.connection.execute(query);
  }

  // NEW: Migrates data using the user-defined 'primaryKey'
  async migrate(target, strategy, realKey, getNewId, createHmac) {
    const { name: tableName, primaryKey } = target;
    const { identifierField, hmacField } = strategy;

    if (!primaryKey) {
      console.warn(`SKIPPING: MySQL migration for "${tableName}" requires a "primaryKey" in user_config.json.`);
      return 0;
    }

    await this.ensureColumns(tableName, strategy);

    // 1. Find all rows (using the PK) that are not signed
    const selectQuery = `SELECT \`${primaryKey}\` FROM \`${tableName}\` WHERE \`${hmacField}\` IS NULL`;
    const [rows] = await this.connection.query(selectQuery);

    if (rows.length === 0) return 0;

    // 2. Loop and update
    let updateCount = 0;
    for (const row of rows) {
      const newId = getNewId();
      const newHash = createHmac(newId, realKey);
      const pkValue = row[primaryKey];
      
      const updateQuery = `
        UPDATE \`${tableName}\`
        SET \`${identifierField}\` = ?, \`${hmacField}\` = ?
        WHERE \`${primaryKey}\` = ?
      `;
      await this.connection.query(updateQuery, [newId, newHash, pkValue]);
      updateCount++;
    }
    return updateCount;
  }
}
module.exports = MySqlAdapter;
