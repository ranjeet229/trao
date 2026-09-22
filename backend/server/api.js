import express from 'express';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import bcrypt from 'bcryptjs';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { randomUUID, createHash } from 'node:crypto';
import { z } from 'zod';
import {
  inputSchema,
  validateKit,
  categories,
  requirementSchema,
  questionSchema,
} from '../src/core/schema.js';
import { checkCoverage } from '../src/core/schedule.js';

const authSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((v) => v.toLowerCase()),
  password: z
    .string()
    .min(10)
    .max(128)
    .refine((v) => Buffer.byteLength(v, 'utf8') <= 72, 'Password must be at most 72 UTF-8 bytes.'),
  name: z.string().trim().min(1).max(80).optional(),
});
const publicUser = (u) => ({ id: u._id, email: u.email, name: u.name });
const error = (res, status, code, message) => res.status(status).json({ error: { code, message } });
function trackChanges(items, oldItems) {
  const existingIds = new Set(oldItems.map((item) => item.id));
  const nextIds = new Set(items.map((item) => item.id));
  const priorOrder = oldItems.filter((item) => nextIds.has(item.id)).map((item) => item.id);
  const nextOrder = items.filter((item) => existingIds.has(item.id)).map((item) => item.id);
  return items.map((item) => {
    const old = oldItems.find((q) => q.id === item.id);
    if (!old) return { ...item, origin: 'manual' };
    const content = ({ origin, pinned, ...rest }) => rest;
    return {
      ...item,
      origin:
        JSON.stringify(content(item)) !== JSON.stringify(content(old)) ||
        priorOrder.indexOf(item.id) !== nextOrder.indexOf(item.id)
          ? 'edited'
          : old.origin,
    };
  });
}
export function createApi(db, { sessionStore, production = false } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      hsts: production ? undefined : false,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(
    session({
      name: 'readyroom.sid',
      secret: process.env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      store:
        sessionStore ||
        MongoStore.create({
          mongoUrl: process.env.MONGODB_URI,
          collectionName: 'sessions',
          ttl: 60 * 60 * 24 * 7,
        }),
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: production,
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    }),
  );
  app.use('/api', (req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.headers.origin;
      const expected = process.env.APP_ORIGIN || `http://localhost:${process.env.PORT || 3000}`;
      if (origin && origin !== expected)
        return error(res, 403, 'INVALID_ORIGIN', 'Request origin is not permitted.');
      if (req.headers['x-requested-with'] !== 'Readyroom')
        return error(res, 403, 'CSRF_REQUIRED', 'Missing request verification header.');
    }
    next();
  });
  const authLimit = rateLimit({
    windowMs: 15 * 60000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
      error: {
        code: 'RATE_LIMIT',
        message: 'Too many authentication attempts. Please try again later.',
      },
    },
  });
  app.post('/api/auth/register', authLimit, async (req, res) => {
    const body = authSchema.parse(req.body);
    const user = {
      _id: randomUUID(),
      email: body.email,
      name: body.name || body.email.split('@')[0],
      passwordHash: await bcrypt.hash(body.password, 12),
      createdAt: new Date(),
    };
    try {
      await db.collection('users').insertOne(user);
    } catch (e) {
      if (e.code === 11000)
        return error(res, 409, 'EMAIL_EXISTS', 'An account already exists for this email.');
      throw e;
    }
    await new Promise((resolve, reject) =>
      req.session.regenerate((e) => (e ? reject(e) : resolve())),
    );
    req.session.user = publicUser(user);
    await new Promise((resolve, reject) => req.session.save((e) => (e ? reject(e) : resolve())));
    res.status(201).json({ user: publicUser(user) });
  });
  app.post('/api/auth/login', authLimit, async (req, res) => {
    const body = authSchema.parse(req.body);
    const user = await db.collection('users').findOne({ email: body.email });
    // Always perform a password hash comparison, even for unknown accounts.
    const hash =
      user?.passwordHash || '$2b$12$KIXxMULCaLMlnfJBKDgx1u5QI75.Am1hSp.XFUf/RXLr80Bgw/ZYe';
    if (!(await bcrypt.compare(body.password, hash)) || !user)
      return error(res, 401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    await new Promise((resolve, reject) =>
      req.session.regenerate((e) => (e ? reject(e) : resolve())),
    );
    req.session.user = publicUser(user);
    await new Promise((resolve, reject) => req.session.save((e) => (e ? reject(e) : resolve())));
    res.json({ user: publicUser(user) });
  });
  app.post('/api/auth/logout', async (req, res) => {
    await new Promise((resolve, reject) => req.session.destroy((e) => (e ? reject(e) : resolve())));
    res.clearCookie('readyroom.sid');
    res.json({ ok: true });
  });
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api', (req, res, next) =>
    req.session.user ? next() : error(res, 401, 'SESSION_EXPIRED', 'Please sign in to continue.'),
  );
  app.get('/api/me', (req, res) =>
    res.json({ user: req.session.user, aiConfigured: Boolean(process.env.GEMINI_API_KEY) }),
  );
  app.get('/api/kits', async (req, res) =>
    res.json({
      kits: await db
        .collection('kits')
        .find({ userId: req.session.user.id }, { projection: { kit: 0, input: 0, practice: 0 } })
        .sort({ updatedAt: -1 })
        .toArray(),
    }),
  );
  const generationLimit = rateLimit({
    windowMs: 60000,
    limit: 12,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
      error: { code: 'RATE_LIMIT', message: 'Please wait a minute before generating more kits.' },
    },
  });
  async function createKit(input, userId) {
    input = inputSchema.parse(input);
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify([
          input.jd.replace(/\s+/g, ' ').trim(),
          input.company_url.replace(/\/$/, ''),
          input.days,
        ]),
      )
      .digest('hex');
    const existing = await db.collection('kits').findOne({ userId, fingerprint });
    if (existing) return { id: existing._id, duplicate: true, status: existing.status };
    const record = {
      _id: randomUUID(),
      userId,
      fingerprint,
      input,
      title: input.jd.split('\n')[0].slice(0, 100),
      company: input.company_url,
      status: 'queued',
      kit: null,
      practice: {},
      revision: 0,
      pendingJob: { id: randomUUID(), createdAt: new Date() },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    try {
      await db.collection('kits').insertOne(record);
    } catch (e) {
      if (e.code === 11000) {
        const found = await db.collection('kits').findOne({ userId, fingerprint });
        return { id: found._id, duplicate: true, status: found.status };
      }
      throw e;
    }
    await db.collection('jobs').updateOne(
      { _id: record.pendingJob.id },
      {
        $setOnInsert: {
          _id: record.pendingJob.id,
          kitId: record._id,
          userId,
          status: 'queued',
          stage: 'queued',
          percent: 0,
          message: 'Waiting for the research worker',
          createdAt: new Date(),
        },
      },
      { upsert: true },
    );
    return { id: record._id, duplicate: false, status: 'queued' };
  }
  app.post('/api/kits', generationLimit, async (req, res) =>
    res.status(202).json(await createKit(req.body, req.session.user.id)),
  );
  app.post('/api/kits/batch', generationLimit, async (req, res) => {
    const cases = z
      .array(inputSchema.extend({ id: z.string().optional() }))
      .min(1)
      .max(10)
      .parse(req.body);
    const results = [];
    for (const item of cases) {
      try {
        results.push({ ...(await createKit(item, req.session.user.id)), caseId: item.id });
      } catch (e) {
        results.push({ caseId: item.id, error: 'Could not queue this case.' });
      }
    }
    res.status(202).json({ results });
  });
  app.use('/api/kits/:id', async (req, res, next) => {
    req.record = await db
      .collection('kits')
      .findOne({ _id: req.params.id, userId: req.session.user.id });
    if (!req.record) return error(res, 404, 'NOT_FOUND', 'Kit not found.');
    next();
  });
  app.get('/api/kits/:id', async (req, res) => {
    const job = await db
      .collection('jobs')
      .find({ kitId: req.record._id, userId: req.session.user.id })
      .sort({ createdAt: -1 })
      .limit(1)
      .next();
    res.json({ ...req.record, job });
  });
  app.put('/api/kits/:id', async (req, res) => {
    const baseline = req.record.kit;
    if (!baseline) return error(res, 409, 'NOT_READY', 'Wait for generation to finish.');
    const body = z
      .object({
        revision: z.number().int(),
        kit: z
          .object({
            role: z.object({ requirements: z.array(requirementSchema) }).passthrough(),
            questions: z.array(questionSchema),
          })
          .passthrough(),
      })
      .parse(req.body);
    const kit = validateKit({
      ...body.kit,
      draft: true,
      coverage: {
        ...body.kit.coverage,
        uncovered_requirement_ids: checkCoverage(body.kit.role.requirements, body.kit.questions),
      },
    });
    kit.questions = trackChanges(kit.questions, baseline.questions);
    kit.flashcards = trackChanges(kit.flashcards, baseline.flashcards);
    const result = await db
      .collection('kits')
      .updateOne(
        { _id: req.record._id, userId: req.session.user.id, revision: body.revision },
        { $set: { kit, updatedAt: new Date() }, $inc: { revision: 1 } },
      );
    if (!result.matchedCount)
      return error(
        res,
        409,
        'REVISION_CONFLICT',
        'A newer version exists. Your unsaved edits are still here; reload before saving again.',
      );
    res.json({ kit, revision: body.revision + 1 });
  });
  app.post('/api/kits/:id/regenerate', generationLimit, async (req, res) => {
    const { section, revision } = z
      .object({
        section: z.enum(['company_brief', 'schedule', ...categories]),
        revision: z.number().int(),
      })
      .parse(req.body);
    if (!req.record.kit) return error(res, 409, 'NOT_READY', 'Kit is not ready.');
    const pendingJob = { id: randomUUID(), section, createdAt: new Date() };
    const changed = await db
      .collection('kits')
      .updateOne(
        { _id: req.record._id, revision, status: 'ready' },
        { $set: { status: 'regenerating', pendingJob } },
      );
    if (!changed.matchedCount)
      return error(
        res,
        409,
        'REVISION_CONFLICT',
        'Save or reload the latest kit before regenerating.',
      );
    const job = {
      _id: pendingJob.id,
      kitId: req.record._id,
      userId: req.session.user.id,
      section,
      status: 'queued',
      percent: 0,
      stage: 'queued',
      message: `Queued ${section}`,
      createdAt: new Date(),
    };
    await db
      .collection('jobs')
      .updateOne({ _id: job._id }, { $setOnInsert: job }, { upsert: true });
    res.status(202).json({ job });
  });
  app.post('/api/kits/:id/retry', generationLimit, async (req, res) => {
    const pendingJob = { id: randomUUID(), createdAt: new Date() };
    const result = await db
      .collection('kits')
      .updateOne(
        { _id: req.record._id, status: 'failed' },
        { $set: { status: 'queued', error: null, pendingJob } },
      );
    if (!result.matchedCount)
      return error(res, 409, 'NOT_FAILED', 'Only failed kits can be retried.');
    await db.collection('jobs').updateOne(
      { _id: pendingJob.id },
      {
        $setOnInsert: {
          _id: pendingJob.id,
          kitId: req.record._id,
          userId: req.session.user.id,
          status: 'queued',
          percent: 0,
          stage: 'queued',
          message: 'Retry queued',
          createdAt: new Date(),
        },
      },
      { upsert: true },
    );
    res.status(202).json({ ok: true });
  });
  app.post('/api/kits/:id/practice', async (req, res) => {
    const { cardId, confidence } = z
      .object({
        cardId: z.string().regex(/^[a-zA-Z0-9_-]+$/),
        confidence: z.number().int().min(1).max(3),
      })
      .parse(req.body);
    if (!req.record.kit?.flashcards.some((f) => f.id === cardId))
      return error(res, 404, 'CARD_NOT_FOUND', 'Flashcard not found.');
    const prior = req.record.practice?.[cardId];
    const entry = {
      confidence,
      reviews: (prior?.reviews || 0) + 1,
      lastReviewed: new Date().toISOString(),
    };
    await db
      .collection('kits')
      .updateOne(
        { _id: req.record._id, userId: req.session.user.id },
        { $set: { [`practice.${cardId}`]: entry } },
      );
    res.json({ entry });
  });
  app.delete('/api/kits/:id', async (req, res) => {
    await db.collection('kits').deleteOne({ _id: req.record._id, userId: req.session.user.id });
    await db.collection('jobs').deleteMany({ kitId: req.record._id, userId: req.session.user.id });
    res.json({ ok: true });
  });
  app.use('/api', (_req, res) => error(res, 404, 'NOT_FOUND', 'Endpoint not found.'));
  app.use((err, req, res, next) => {
    if (err.name === 'ZodError')
      return error(
        res,
        422,
        'VALIDATION_ERROR',
        err.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ')
          .slice(0, 900),
      );
    if (err.type === 'entity.too.large')
      return error(res, 413, 'TOO_LARGE', 'Request exceeds 1 MB.');
    if (err instanceof SyntaxError)
      return error(res, 400, 'INVALID_JSON', 'Request body is not valid JSON.');
    console.error('API error:', err.name);
    error(res, 500, 'INTERNAL_ERROR', 'The operation could not be completed. Please retry.');
  });
  return app;
}
