import fs from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
try {
  await fs.access('.env');
  console.log('.env already exists; left unchanged.');
} catch {
  await fs.writeFile(
    '.env',
    `MONGODB_URI=mongodb://127.0.0.1:27017/readyroom\nGEMINI_API_KEY=\nGEMINI_MODEL=gemini-3.5-flash-lite\nSESSION_SECRET=${randomBytes(48).toString('hex')}\nPORT=3000\nAPP_ORIGIN=http://localhost:3000\nALLOW_PRIVATE_URLS=false\nLLM_MIN_INTERVAL_MS=6500\nLLM_TIMEOUT_MS=20000\n`,
    { flag: 'wx' },
  );
  console.log('Created .env. Set your MongoDB URI and Gemini key before starting.');
}
