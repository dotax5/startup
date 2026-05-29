const { MongoClient } = require('mongodb');

let db;

async function connectToDB() {
  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  db = client.db();
  console.log('Connected to MongoDB');
  return db;
}

function getDB() {
  if (!db) throw new Error('DB not connected');
  return db;
}

module.exports = { connectToDB, getDB };
