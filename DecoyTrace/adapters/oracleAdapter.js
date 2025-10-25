const oracledb = require('oracledb');

// Oracle requires a specific configuration to find its client libraries
// This might need setup on the host machine (e.g., setting LD_LIBRARY_PATH)
// or using oracledb.initOracleClient().
// For the hackathon, we'll assume the driver is set up.

class OracleAdapter {
  constructor(connectionString) {
    // OracleDB driver uses user, password, and connectString
    // We'll assume the connectionString is in the format:
    // user/password@connectString
    const [user, rest] = connectionString.split('/');
    const [password, connectStr] = rest.split('@');
    
    this.dbConfig = { user, password, connectString: connectStr };
    this.connection = null;
  }

  async connect() {
    try {
      this.connection = await oracledb.getConnection(this.dbConfig);
      console.log("Successfully connected to OracleDB.");
    } catch (error) {
      console.error("Failed to connect to OracleDB:", error);
      throw error;
    }
  }

async ensureColumns(tableName, strategy) {
    const { identifierField, hmacField } = strategy;
    try {
      await this.connection.execute(`ALTER TABLE "${tableName}" ADD ("${identifierField}" VARCHAR2(255 CHAR))`);
    } catch (e) { if (e.errorNum !== 955) throw e; } // ORA-00955: name is already used
    try {
      await this.connection.execute(`ALTER TABLE "${tableName}" ADD ("${hmacField}" VARCHAR2(255 CHAR))`);
    } catch (e) { if (e.errorNum !== 955) throw e; }
  }

  async insert(tableName, data, strategy) {
    if (!data || data.length === 0) return;
    
    await this.ensureColumns(tableName, strategy);

    const keys = Object.keys(data[0]);
    // Use quotes `"` for identifiers
    const columns = keys.map(k => `"${k}"`).join(', ');
    
    // Create placeholders like (:1, :2, :3)
    const rowPlaceholder = `(${keys.map((k, i) => `:${i + 1}`).join(', ')})`;

    const query = `
      INSERT INTO "${tableName}" (${columns}) 
      VALUES ${rowPlaceholder}
    `;

    // Oracle's `executeMany` is the most efficient way
    const bindData = data.map(row => keys.map(key => row[key]));

    try {
      await this.connection.executeMany(query, bindData, { autoCommit: true });
    } catch (error) {
      console.error(`Failed to insert data into table "${tableName}":`, error);
      throw error;
    }
  }

  async disconnect() {
    if (this.connection) {
      await this.connection.close();
      console.log("OracleDB connection closed.");
    }
  }
// NEW: Migrates data using 'ROWID'
  async migrate(target, strategy, realKey, getNewId, createHmac) {
    const { name: tableName } = target;
    const { identifierField, hmacField } = strategy;

    await this.ensureColumns(tableName, strategy);
    
    // 1. Find all rows (using built-in 'ROWID') that are not signed
    const selectQuery = `SELECT ROWID FROM "${tableName}" WHERE "${hmacField}" IS NULL`;
    const res = await this.connection.execute(selectQuery);

    if (res.rows.length === 0) return 0;

    // 2. Loop and update
    let updateCount = 0;
    for (const row of res.rows) {
      const newId = getNewId();
      const newHash = createHmac(newId, realKey);
      const rowId = row[0];
      
      const updateQuery = `
        UPDATE "${tableName}"
        SET "${identifierField}" = :newId, "${hmacField}" = :newHash
        WHERE ROWID = :rowId
      `;
      await this.connection.execute(updateQuery, {
        newId,
        newHash,
        rowId
      }, { autoCommit: true }); // Commit each update
      updateCount++;
    }
    return updateCount;
  }

  async find(tableName) {
    if (!this.connection) throw new Error("Not connected.");

    const query = `SELECT * FROM "${tableName}"`;
    // Add outFormat to get objects instead of arrays
    const res = await this.connection.execute(query, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
    return res.rows;
  }
}
module.exports = OracleAdapter;