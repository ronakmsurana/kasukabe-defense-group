const { MongoClient, ObjectId } = require('mongodb');

class MongoAdapter {
  constructor(connectionString) {
    this.client = new MongoClient(connectionString);
    this.db = null;
  }

  async connect() {
    try {
      await this.client.connect();
      // Assumes the database name is part of the connection string
      this.db = this.client.db(); 
      console.log("Successfully connected to MongoDB.");
    } catch (error) {
      console.error("Failed to connect to MongoDB:", error);
      throw error;
    }
  }

  // MongoDB's insert doesn't need the strategy object, but we
  // include it in the signature to match the other adapters.
  async insert(collectionName, data, strategy) { 
    if (!this.db) {
      throw new Error("Not connected to the database. Call connect() first.");
    }
    try {
      const collection = this.db.collection(collectionName);
      const result = await collection.insertMany(data);
      return result;
    } catch (error) {
      console.error(`Failed to insert data into collection "${collectionName}":`, error);
      throw error;
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.close();
      console.log("MongoDB connection closed.");
    }
  }


async ensureColumns(tableName, strategy) {
    return; // Not needed for schema-less MongoDB
  }

  // NEW: Efficiently migrates existing data
  async migrate(target, strategy, realKey, getNewId, createHmac) {
    const { name: collectionName } = target;
    const { identifierField, hmacField } = strategy;

    if (!this.db) throw new Error("Not connected.");
    
    const collection = this.db.collection(collectionName);
    
    // Find all documents that do NOT have the hmacField
    const filter = { [hmacField]: { $exists: false } };
    const cursor = collection.find(filter);

    const bulkOps = [];
    for await (const doc of cursor) {
      const newId = getNewId();
      const newHash = createHmac(newId, realKey);
      
      bulkOps.push({
        updateOne: {
          filter: { _id: doc._id },
          update: {
            $set: {
              [identifierField]: newId,
              [hmacField]: newHash
            }
          }
        }
      });
    }

    if (bulkOps.length === 0) {
      return 0;
    }

    const result = await collection.bulkWrite(bulkOps);
    return result.modifiedCount;
  }

  async find(collectionName) {
    if (!this.db) {
      throw new Error("Not connected to the database. Call connect() first.");
    }
    return this.db.collection(collectionName).find({}).toArray();
  }
}
module.exports = MongoAdapter;