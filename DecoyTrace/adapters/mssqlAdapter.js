const sql = require('mssql');

class MssqlAdapter {
  constructor(connectionString) {
    this.connectionString = connectionString;
    this.pool = null;
  }

  async connect() {
    try {
      this.pool = await new sql.ConnectionPool(this.connectionString).connect();
      console.log("Successfully connected to MS SQL Server.");
    } catch (error) {
      console.error("Failed to connect to MS SQL Server:", error);
      throw error;
    }
  }

  // UPDATED: Extracted from 'insert'
  async ensureColumns(tableName, strategy) {
    const { identifierField, hmacField } = strategy;
    const query = `
      IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('${tableName}') AND name = '${identifierField}')
      BEGIN
        ALTER TABLE [${tableName}] ADD [${identifierField}] VARCHAR(255)
      END
      IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('${tableName}') AND name = '${hmacField}')
      BEGIN
        ALTER TABLE [${tableName}] ADD [${hmacField}] VARCHAR(255)
      END
    `;
    await this.pool.request().query(query);
  }

  // NEW: Migrates data using the user-defined 'primaryKey'
  async migrate(target, strategy, realKey, getNewId, createHmac) {
    const { name: tableName, primaryKey } = target;
    const { identifierField, hmacField } = strategy;

    if (!primaryKey) {
      console.warn(`SKIPPING: MS SQL migration for "${tableName}" requires a "primaryKey" in user_config.json.`);
      return 0;
    }

    await this.ensureColumns(tableName, strategy);

    // 1. Find all rows
    const selectQuery = `SELECT [${primaryKey}] FROM [${tableName}] WHERE [${hmacField}] IS NULL`;
    const res = await this.pool.request().query(selectQuery);

    if (res.recordset.length === 0) return 0;

    // 2. Loop and update
    let updateCount = 0;
    for (const row of res.recordset) {
      const newId = getNewId();
      const newHash = createHmac(newId, realKey);
      const pkValue = row[primaryKey];
      
      const request = this.pool.request();
      // Use parameterized query
      request.input('newId', sql.VarChar, newId);
      request.input('newHash', sql.VarChar, newHash);
      request.input('pkValue', pkValue); // Let driver infer type
      
      const updateQuery = `
        UPDATE [${tableName}]
        SET [${identifierField}] = @newId, [${hmacField}] = @newHash
        WHERE [${primaryKey}] = @pkValue
      `;
      await request.query(updateQuery);
      updateCount++;
    }
    return updateCount;
  }

  async insert(tableName, data, strategy) {
    if (!data || data.length === 0) return;
    
    await this.ensureColumns(tableName, strategy);

    // MS SQL is most efficient when inserting rows one by one
    // or using bulk insert, but a loop is safer for this hackathon.
    // For simplicity, we'll build a single large query.

    const keys = Object.keys(data[0]);
    // Use brackets `[]` for identifiers
    const columns = keys.map(k => `[${k}]`).join(', ');
    
    // Create values like ('val1', 'val2'), ('val3', 'val4')
    const allValues = [];
    const valueRows = data.map(row => {
      const rowValues = keys.map(key => {
        // Simple value escaping for SQL strings
        const val = row[key];
        if (typeof val === 'string') {
          return `'${val.replace(/'/g, "''")}'`; // Escape single quotes
        }
        if (val === null || val === undefined) return 'NULL';
        return val; // Numbers, booleans
      }).join(', ');
      return `(${rowValues})`;
    }).join(', ');

    const query = `
      INSERT INTO [${tableName}] (${columns}) 
      VALUES ${valueRows}
    `;

    try {
      await this.pool.request().query(query);
    } catch (error) {
      console.error(`Failed to insert data into table "${tableName}":`, error);
      throw error;
    }
  }

  async disconnect() {
    if (this.pool) {
      await this.pool.close();
      console.log("MS SQL Server connection closed.");
    }
  }
}

module.exports = MssqlAdapter;