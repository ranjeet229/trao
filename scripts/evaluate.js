import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { generateKit } from '../backend/src/core/pipeline.js';

const { values } = parseArgs({
  options: { input: { type: 'string' }, output: { type: 'string' } },
});
if (!values.input || !values.output) {
  console.error('Usage: npm run evaluate -- --input <cases.json> --output <kits.json>');
  process.exit(1);
}
try {
  const cases = JSON.parse(await fs.readFile(values.input, 'utf8'));
  if (!Array.isArray(cases)) throw new Error('Input must be an array of cases.');
  const output = { version: '1.0', generated_at: new Date().toISOString(), kits: [] };
  for (const item of cases) {
    try {
      if (typeof item?.id !== 'string' || !item.id)
        throw new Error('Every case needs a nonempty string id.');
      const kit = await generateKit(item, {
        allowPrivate: process.env.NODE_ENV !== 'production',
        onProgress: async (stage, percent) =>
          process.stderr.write(`[${item.id}] ${percent}% ${stage}\n`),
      });
      output.kits.push({ id: item.id, status: 'ok', kit, error: null });
    } catch (error) {
      output.kits.push({
        id: item?.id ?? null,
        status: 'failed',
        kit: null,
        error: {
          code: error.name === 'ZodError' ? 'INVALID_INPUT' : 'GENERATION_FAILED',
          message:
            error.name === 'ZodError'
              ? 'Invalid case: jd must be 5–30000 characters, company_url is required, days must be 1–60.'
              : error.message,
        },
      });
    }
  }
  await fs.mkdir(path.dirname(path.resolve(values.output)), { recursive: true });
  await fs.writeFile(values.output, JSON.stringify(output, null, 2) + '\n');
  console.log(`Wrote ${output.kits.length} results to ${values.output}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
