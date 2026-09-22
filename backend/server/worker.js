import { randomUUID } from 'node:crypto';
import { generateKit, regenerateSection } from '../src/core/pipeline.js';

export function startWorker(db, { interval = 1000, pipeline = generateKit } = {}) {
  let stopped = false,
    busy = false;
  async function tick() {
    if (stopped || busy) return;
    busy = true;
    let job;
    const token = randomUUID();
    try {
      job = await db.collection('jobs').findOneAndUpdate(
        { $or: [{ status: 'queued' }, { status: 'running', leaseUntil: { $lt: new Date() } }] },
        {
          $set: {
            status: 'running',
            token,
            leaseUntil: new Date(Date.now() + 240000),
            updatedAt: new Date(),
          },
        },
        { sort: { createdAt: 1 }, returnDocument: 'after' },
      );
      if (!job) {
        // Recover a durable kit-side intent if interrupted before the queue insert.
        const pending = await db
          .collection('kits')
          .find({ status: { $in: ['queued', 'regenerating'] }, 'pendingJob.id': { $exists: true } })
          .limit(20)
          .toArray();
        for (const kit of pending)
          await db
            .collection('jobs')
            .updateOne(
              { _id: kit.pendingJob.id },
              {
                $setOnInsert: {
                  _id: kit.pendingJob.id,
                  kitId: kit._id,
                  userId: kit.userId,
                  section: kit.pendingJob.section,
                  status: 'queued',
                  percent: 0,
                  stage: 'queued',
                  message: 'Recovered queued work',
                  createdAt: kit.pendingJob.createdAt,
                },
              },
              { upsert: true },
            );
        return;
      }
      const update = async (stage, percent, message) => {
        await db.collection('jobs').updateOne(
          { _id: job._id, token },
          {
            $set: {
              stage,
              percent,
              message,
              leaseUntil: new Date(Date.now() + 240000),
              updatedAt: new Date(),
            },
          },
        );
      };
      const record = await db.collection('kits').findOne({ _id: job.kitId, userId: job.userId });
      if (!record) throw new Error('Kit no longer exists.');
      if (
        (record.status === 'ready' && !record.pendingJob) ||
        (record.pendingJob && record.pendingJob.id !== job._id)
      ) {
        await db
          .collection('jobs')
          .updateOne(
            { _id: job._id, token },
            {
              $set: {
                status: 'complete',
                percent: 100,
                message: 'Result already persisted or superseded',
                updatedAt: new Date(),
              },
            },
          );
        return;
      }
      let kit;
      if (job.section) {
        await update('regenerating', 30, `Regenerating ${job.section}`);
        kit = await regenerateSection(record.kit, job.section);
      } else
        kit = await pipeline(record.input, {
          onProgress: update,
          allowPrivate:
            process.env.NODE_ENV !== 'production' && process.env.ALLOW_PRIVATE_URLS === 'true',
        });
      if (!(await db.collection('jobs').findOne({ _id: job._id, token, status: 'running' })))
        return;
      const result = await db.collection('kits').updateOne(
        { _id: record._id, revision: record.revision },
        {
          $set: { kit, status: 'ready', updatedAt: new Date(), error: null },
          $inc: { revision: 1 },
          $unset: { pendingJob: '' },
        },
      );
      if (!result.matchedCount)
        throw new Error(
          'Kit changed during generation. Your edits were preserved; retry regeneration.',
        );
      await db.collection('jobs').updateOne(
        { _id: job._id, token },
        {
          $set: {
            status: 'complete',
            percent: 100,
            stage: 'complete',
            message: 'Your kit is ready',
            updatedAt: new Date(),
          },
        },
      );
    } catch (error) {
      if (job) {
        const message =
          error.name === 'ZodError'
            ? 'Generated material failed validation. Please retry.'
            : error.message;
        const failed = await db
          .collection('jobs')
          .updateOne(
            { _id: job._id, token },
            {
              $set: {
                status: 'failed',
                error: { code: 'GENERATION_FAILED', message },
                updatedAt: new Date(),
              },
            },
          )
          .catch(() => null);
        if (failed?.matchedCount)
          await db
            .collection('kits')
            .updateOne(
              { _id: job.kitId, status: { $in: ['queued', 'regenerating'] } },
              {
                $set: {
                  status: job.section ? 'ready' : 'failed',
                  error: message,
                  updatedAt: new Date(),
                },
                $unset: { pendingJob: '' },
              },
            )
            .catch(() => {});
      } else console.error('Worker database operation failed:', error.name);
    } finally {
      busy = false;
    }
  }
  const timer = setInterval(tick, interval);
  void tick();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
