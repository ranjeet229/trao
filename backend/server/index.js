import 'dotenv/config';
import next from 'next';
import { fileURLToPath } from 'node:url';
import { connectDatabase } from './db.js';
import { createApi } from './api.js';
import { startWorker } from './worker.js';

const production = process.argv.includes('--production') || process.env.NODE_ENV === 'production';
if (production) process.env.NODE_ENV = 'production';
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)
  throw new Error('Set SESSION_SECRET to a random value of at least 32 characters in .env.');
const port = Number(process.env.PORT || 3000);
const { db, client } = await connectDatabase();
const frontend = next({
  dev: !production,
  port,
  hostname: 'localhost',
  dir: fileURLToPath(new URL('../../frontend/', import.meta.url)),
});
await frontend.prepare();
const app = createApi(db, { production });
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
app.use((req, res, next) => {
  const pathname = req.path;
  if (
    !pathname.startsWith('/_next/') &&
    !['/login', '/favicon.ico'].includes(pathname) &&
    !req.session.user
  )
    return res.redirect('/login');
  if (pathname === '/login' && req.session.user) return res.redirect('/');
  next();
});
app.use((req, res) => frontend.getRequestHandler()(req, res));
const stopWorker = startWorker(db);
const server = app.listen(port, () =>
  console.log(`Readyroom is running at http://localhost:${port}`),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    stopWorker();
    server.close(async () => {
      await client.close();
      process.exit(0);
    });
  });
