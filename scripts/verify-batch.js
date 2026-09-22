import fs from 'node:fs/promises';
import http from 'node:http';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { validateKit } from '../backend/src/core/schema.js';

const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', req.url === '/robots.txt' ? 'text/plain' : 'text/html');
  if (req.url === '/robots.txt') return res.end('User-agent: *\nAllow: /');
  if (req.url === '/acme/')
    return res.end(
      '<title>Acme</title><main>Acme makes developer collaboration tools.<a href="people/hiring/our-approach">How we hire</a></main>',
    );
  if (req.url === '/acme/people/hiring/our-approach')
    return res.end(
      '<main>Hiring process: a take-home exercise, system design interview, and a collaboration discussion.</main>',
    );
  res.statusCode = 404;
  res.end('Missing');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/acme/`;
await fs.mkdir('output', { recursive: true });
const cases = [
  {
    id: 'normal',
    jd: 'Senior Backend Engineer\nRequired: Node.js experience.\nDesign distributed systems.\nMentor junior engineers.\nNice to have: Kubernetes experience.',
    company_url: url,
    days: 5,
  },
  {
    id: 'one-day',
    jd: 'Frontend Engineer\nReact and TypeScript experience required.',
    company_url: url,
    days: 1,
  },
  {
    id: 'sixty-days',
    jd: 'Engineering Lead\nMentor junior engineers.\nDesign distributed systems.',
    company_url: url,
    days: 60,
  },
  { id: 'thin', jd: 'Developer\nContact us.', company_url: url + 'missing', days: 3 },
  { id: 'bad-url', jd: 'Engineer\nPython experience required.', company_url: 'not-a-url', days: 7 },
  { id: 'invalid-input', jd: 'No', company_url: url, days: 0 },
];
await fs.writeFile('output/verification-cases.json', JSON.stringify(cases));
const live = process.argv.includes('--live');
const started = Date.now();
try {
  const child = spawn(
    process.execPath,
    [
      'scripts/evaluate.js',
      '--input',
      'output/verification-cases.json',
      '--output',
      `output/${live ? 'live-' : 'offline-'}kits.json`,
    ],
    { stdio: 'inherit', env: { ...process.env, ...(!live ? { LLM_DISABLED: 'true' } : {}) } },
  );
  const code = await new Promise((r) => child.on('exit', r));
  assert.equal(code, 0);
  const output = JSON.parse(
    await fs.readFile(`output/${live ? 'live-' : 'offline-'}kits.json`, 'utf8'),
  );
  assert.equal(output.version, '1.0');
  assert.equal(output.kits.length, cases.length);
  for (let i = 0; i < 5; i++) {
    assert.equal(output.kits[i].status, 'ok');
    validateKit(output.kits[i].kit);
    assert.equal(output.kits[i].kit.schedule.days_available, cases[i].days);
    assert.deepEqual(output.kits[i].kit.coverage.uncovered_requirement_ids, []);
  }
  assert.equal(output.kits[5].status, 'failed');
  assert.ok(
    output.kits[0].kit.source.pages_used.some((p) => p.endsWith('/people/hiring/our-approach')),
  );
  assert.ok(Date.now() - started < 900000);
  assert.ok(
    output.kits[2].kit.role.requirements.length >= 2,
    'Explicit mentoring/design duties must not disappear',
  );
  console.log(
    `PASS: five complete kits + one recorded failure in ${Math.round((Date.now() - started) / 1000)} seconds. Modes: ${output.kits
      .slice(0, 5)
      .map((k) => k.kit.research.mode)
      .join(', ')}`,
  );
} finally {
  server.close();
}
