import 'dotenv/config';
import { MongoClient } from 'mongodb';

const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 12000 });
try {
  await client.connect();
  await client.db().command({ ping: 1 });
  console.log('MongoDB: connected successfully.');
} catch (error) {
  console.log(`MongoDB: ${error.name}. Check the Atlas network access list, DNS and credentials.`);
  process.exitCode = 1;
} finally {
  await client.close();
}
try {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify({ contents: [{ parts: [{ text: 'Reply with OK.' }] }] }),
      signal: AbortSignal.timeout(20000),
    },
  );
  const body = await response.json();
  console.log(
    `Gemini: HTTP ${response.status}${body.error?.status ? ' (' + body.error.status + ')' : ''}.`,
  );
  if (!response.ok) {
    console.log(
      'Gemini message:',
      String(body.error?.message || 'Request rejected').replaceAll(
        process.env.GEMINI_API_KEY,
        '[redacted]',
      ),
    );
    process.exitCode = 1;
  }
} catch (error) {
  console.log(`Gemini: ${error.name}. Network connection could not be completed.`);
  process.exitCode = 1;
}
