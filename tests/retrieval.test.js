import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Retriever } from '../backend/src/research/fetch.js';

test('retrieval limits content, respects redirects and retries transient HTTP errors', async (t) => {
  let retries = 0;
  const server = http.createServer((req, res) => {
    if (req.url === '/robots.txt') {
      res.setHeader('Content-Type', 'text/plain');
      return res.end('User-agent: *\nDisallow: /blocked');
    }
    if (req.url === '/retry' && retries++ < 2) {
      res.statusCode = 429;
      res.setHeader('Retry-After', '0');
      return res.end('slow down');
    }
    if (req.url === '/redirect') {
      res.statusCode = 302;
      res.setHeader('Location', '/blocked');
      return res.end();
    }
    if (req.url === '/binary') {
      res.setHeader('Content-Type', 'application/octet-stream');
      return res.end('abc');
    }
    res.setHeader('Content-Type', 'text/html');
    res.end(req.url === '/large' ? 'x'.repeat(5000) : '<main>Success</main>');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}`;
  const retriever = new Retriever({ allowPrivate: true, delay: 0, maxBytes: 1000 });
  assert.match((await retriever.page(url + '/retry')).text, /Success/);
  assert.equal(retries, 3);
  await assert.rejects(retriever.page(url + '/redirect'), /Disallowed/);
  await assert.rejects(retriever.page(url + '/binary'), /content type/);
  await assert.rejects(retriever.page(url + '/large'), /size limit/);
});
