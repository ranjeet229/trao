import dns from 'node:dns/promises';
import net from 'node:net';
import ipaddr from 'ipaddr.js';
import { Agent, fetch } from 'undici';
import robotsParser from 'robots-parser';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export function isPublicAddress(address) {
  try {
    let ip = ipaddr.parse(address);
    if (ip.kind() === 'ipv6' && ip.isIPv4MappedAddress()) ip = ip.toIPv4Address();
    return ip.range() === 'unicast';
  } catch {
    return false;
  }
}
export async function validateUrl(raw, allowPrivate = false, timeout = 6000) {
  const url = new URL(raw);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password)
    throw new Error('Only HTTP(S) URLs without credentials are allowed.');
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  let timer;
  let addresses;
  try {
    addresses = net.isIP(hostname)
      ? [{ address: hostname, family: net.isIP(hostname) }]
      : await Promise.race([
          dns.lookup(hostname, { all: true }),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('DNS lookup timed out.')), timeout);
          }),
        ]);
  } finally {
    clearTimeout(timer);
  }
  if (!addresses.length || (!allowPrivate && addresses.some((a) => !isPublicAddress(a.address))))
    throw new Error('Private, loopback and reserved addresses are blocked.');
  return { url, addresses };
}

export class Retriever {
  constructor({
    allowPrivate = false,
    timeout = 6000,
    maxBytes = 4000000,
    delay = 350,
    deadline = Date.now() + 70000,
  } = {}) {
    this.allowPrivate = allowPrivate;
    this.timeout = timeout;
    this.maxBytes = maxBytes;
    this.delay = delay;
    this.deadline = deadline;
    this.robots = new Map();
    this.lastFetch = 0;
  }
  async raw(raw, types = ['text/html', 'application/xhtml+xml'], redirects = 0) {
    if (Date.now() > this.deadline) throw new Error('Research time budget reached.');
    if (redirects > 4) throw new Error('Too many redirects.');
    const { url, addresses } = await validateUrl(
      raw,
      this.allowPrivate,
      Math.max(1, Math.min(this.timeout, this.deadline - Date.now())),
    );
    // Pin the connection to the addresses actually validated; prevent DNS rebinding.
    const dispatcher = new Agent({
      connect: {
        lookup: (hostname, options, callback) => {
          if (options.all) callback(null, addresses);
          else callback(null, addresses[0].address, addresses[0].family);
        },
      },
    });
    try {
      const wait = Math.max(0, this.lastFetch + this.delay - Date.now());
      if (Date.now() + wait >= this.deadline)
        throw new Error('Research time budget reached before the next permitted crawl.');
      await sleep(wait);
      this.lastFetch = Date.now();
      const res = await fetch(url, {
        dispatcher,
        redirect: 'manual',
        signal: AbortSignal.timeout(
          Math.max(1, Math.min(this.timeout, this.deadline - Date.now())),
        ),
        headers: {
          'user-agent': 'ReadyroomBot/1.0 (interview preparation research)',
          accept: types.join(', '),
        },
      });
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const location = res.headers.get('location');
        await res.body?.cancel();
        if (!location) throw new Error('Redirect without destination.');
        const target = new URL(location, url).href;
        // Every destination is revalidated, including robots permission.
        if (!types.includes('text/plain')) await this.allowed(target);
        return this.raw(target, types, redirects + 1);
      }
      if (!res.ok) {
        await res.body?.cancel();
        const error = new Error(`HTTP ${res.status}`);
        error.status = res.status;
        const retry = res.headers.get('retry-after');
        error.retryAfter = retry
          ? /^\d+$/.test(retry)
            ? Number(retry) * 1000
            : Math.max(0, Date.parse(retry) - Date.now())
          : 0;
        throw error;
      }
      const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!types.includes(type)) {
        await res.body?.cancel();
        throw new Error(`Unsupported content type: ${type || 'missing'}`);
      }
      if (Number(res.headers.get('content-length')) > this.maxBytes) {
        await res.body?.cancel();
        throw new Error('Page exceeds size limit.');
      }
      const reader = res.body.getReader();
      let size = 0;
      const chunks = [];
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > this.maxBytes) {
          await reader.cancel();
          throw new Error('Page exceeds size limit.');
        }
        chunks.push(value);
      }
      return { url: url.href, text: Buffer.concat(chunks).toString('utf8') };
    } finally {
      await dispatcher.close();
    }
  }
  async allowed(raw) {
    const url = new URL(raw);
    const origin = url.origin;
    if (!this.robots.has(origin)) {
      let policy;
      try {
        const data = await this.raw(`${origin}/robots.txt`, ['text/plain']);
        policy = robotsParser(`${origin}/robots.txt`, data.text);
      } catch (error) {
        if (error.status === 404 || error.status === 410) policy = null;
        else throw new Error(`Could not verify robots.txt: ${error.message}`);
      }
      this.robots.set(origin, policy);
    }
    const policy = this.robots.get(origin);
    if (policy?.isAllowed(url.href, 'ReadyroomBot') === false)
      throw new Error('Disallowed by robots.txt.');
    const delay = policy?.getCrawlDelay('ReadyroomBot');
    if (delay) this.delay = Math.max(this.delay, delay * 1000);
  }
  async page(url) {
    await this.allowed(url);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.raw(url);
      } catch (error) {
        if (
          attempt === 2 ||
          Date.now() > this.deadline ||
          (error.status && error.status !== 429 && error.status < 500)
        )
          throw error;
        const wait = Math.max(error.retryAfter || 0, 500 * 2 ** attempt);
        if (Date.now() + wait > this.deadline) throw error;
        await sleep(wait);
      }
    }
  }
}
