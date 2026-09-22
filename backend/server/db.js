import { MongoClient } from 'mongodb';
export async function connectDatabase() {
  if (!process.env.MONGODB_URI) throw new Error('Set MONGODB_URI in .env.');
  const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 12000 });
  await client.connect();
  const db = client.db();
  await Promise.all([
    db.collection('users').createIndex({ email: 1 }, { unique: true }),
    db.collection('kits').createIndex({ userId: 1, fingerprint: 1 }, { unique: true }),
    db.collection('jobs').createIndex({ status: 1, createdAt: 1 }),
    db.collection('kits').createIndex({ userId: 1, updatedAt: -1 }),
  ]);
  return { db, client };
}
