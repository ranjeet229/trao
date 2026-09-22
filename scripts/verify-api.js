import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import session from 'express-session';
import request from 'supertest';
import { createApi } from '../backend/server/api.js';
import { startWorker } from '../backend/server/worker.js';
import { generateKit } from '../backend/src/core/pipeline.js';

// Uses isolated collection names in a uniquely named test database, then drops only that database.
const name = `readyroom_test_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 12000 });
await client.connect();
const db = client.db(name);
let stop;
try {
  await db.collection('users').createIndex({ email: 1 }, { unique: true });
  await db.collection('kits').createIndex({ userId: 1, fingerprint: 1 }, { unique: true });
  const app = createApi(db, { sessionStore: new session.MemoryStore() });
  const a = request.agent(app),
    b = request.agent(app);
  const send = (agent, method, path, body) =>
    agent[method](path).set('X-Requested-With', 'Readyroom').send(body);
  await request(app).get('/api/kits').expect(401);
  await request(app).post('/api/auth/register').send({}).expect(403);
  await send(a, 'post', '/api/auth/register', {
    email: 'alice@example.test',
    password: 'TestPassword123!',
    name: 'Alice',
  }).expect(201);
  await send(b, 'post', '/api/auth/register', {
    email: 'bob@example.test',
    password: 'TestPassword123!',
    name: 'Bob',
  }).expect(201);
  const input = {
    jd: 'Engineer\nRequired: React experience\nMentor junior engineers',
    company_url: 'invalid-url',
    days: 5,
  };
  const created = await send(a, 'post', '/api/kits', input).expect(202);
  const id = created.body.id;
  assert.equal((await send(a, 'post', '/api/kits', input).expect(202)).body.id, id);
  await b.get(`/api/kits/${id}`).expect(404);
  await send(b, 'delete', `/api/kits/${id}`).expect(404);
  await send(a, 'put', `/api/kits/${id}`, { revision: 0, kit: {} }).expect(409);
  // Simulate interruption after kit insertion and before queue insertion.
  await db.collection('jobs').deleteMany({ kitId: id });
  // A separate interrupted running job should be reclaimed from its expired lease.
  const second = await send(a, 'post', '/api/kits', { ...input, days: 1 }).expect(202);
  await db
    .collection('jobs')
    .updateOne(
      { kitId: second.body.id },
      { $set: { status: 'running', leaseUntil: new Date(0), token: 'abandoned' } },
    );
  const fallbackClient = { aiCalls: 0, fallbackCalls: 1, json: async (i, d, s, f) => f() };
  stop = startWorker(db, {
    interval: 30,
    pipeline: (input, options) =>
      generateKit(input, { ...options, client: fallbackClient, skipDiscussion: true }),
  });
  let record;
  for (let i = 0; i < 100; i++) {
    record = (await a.get(`/api/kits/${id}`).expect(200)).body;
    if (record.status === 'ready' && record.job?.status === 'complete') break;
    await new Promise((r) => setTimeout(r, 40));
  }
  assert.equal(record.status, 'ready');
  assert.equal(record.job.status, 'complete');
  assert.equal((await a.get(`/api/kits/${second.body.id}`).expect(200)).body.status, 'ready');
  await send(a, 'put', `/api/kits/${id}`, { revision: record.revision, kit: {} }).expect(422);
  const edited = structuredClone(record.kit);
  edited.company_brief.summary = 'A user edit.';
  edited.questions[0].prompt = 'My edited question';
  const saved = await send(a, 'put', `/api/kits/${id}`, {
    revision: record.revision,
    kit: edited,
  }).expect(200);
  assert.equal(saved.body.kit.questions[0].origin, 'edited');
  await send(a, 'put', `/api/kits/${id}`, { revision: record.revision, kit: edited }).expect(409);
  const card = edited.flashcards[0];
  await send(a, 'post', `/api/kits/${id}/practice`, { cardId: card.id, confidence: 1 }).expect(200);
  assert.equal((await a.get(`/api/kits/${id}`).expect(200)).body.practice[card.id].confidence, 1);
  const bad = structuredClone(edited);
  bad.schedule.days[0].minutes = 1.5;
  await send(a, 'put', `/api/kits/${id}`, { revision: saved.body.revision, kit: bad }).expect(422);
  await send(a, 'post', `/api/kits/${id}/regenerate`, {
    section: 'schedule',
    revision: saved.body.revision,
  }).expect(202);
  for (let i = 0; i < 100; i++) {
    record = (await a.get(`/api/kits/${id}`).expect(200)).body;
    if (record.status === 'ready' && record.job?.status === 'complete') break;
    await new Promise((r) => setTimeout(r, 40));
  }
  assert.equal(record.status, 'ready');
  assert.equal(record.kit.company_brief.summary, 'A user edit.');
  assert.equal(record.kit.questions[0].prompt, 'My edited question');
  await send(a, 'post', '/api/auth/logout').expect(200);
  await a.get('/api/kits').expect(401);
  await send(a, 'post', '/api/auth/login', {
    email: 'alice@example.test',
    password: 'TestPassword123!',
  }).expect(200);
  assert.equal((await a.get('/api/kits').expect(200)).body.kits.length, 2);
  assert.equal((await b.get('/api/kits').expect(200)).body.kits.length, 0);
  console.log(
    'PASS: authentication, CSRF, user isolation, duplicates, worker recovery, expired leases, generation, regeneration, persistence, revision conflicts, edit state, practice and invalid-kit rejection.',
  );
} finally {
  stop?.();
  await new Promise((r) => setTimeout(r, 100));
  if (!name.startsWith('readyroom_test_')) throw new Error('Refusing to clean unexpected database');
  await db.dropDatabase();
  await client.close();
}
