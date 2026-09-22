import { load } from 'cheerio';
import { Retriever } from './fetch.js';

export function cleanPage({ text, url }) {
  const $ = load(text);
  $('script,style,noscript,svg,iframe,form').remove();
  const title = $('title').text().trim();
  const company =
    $('meta[property="og:site_name"]').attr('content') || title.split(/[|–—]/)[0].trim();
  const links = [];
  $('a[href]').each((_, el) => {
    try {
      const target = new URL($(el).attr('href'), url);
      target.hash = '';
      if (!['http:', 'https:'].includes(target.protocol)) return;
      const label = $(el).text().replace(/\s+/g, ' ').trim();
      const subject = `${label} ${target.pathname}`.toLowerCase();
      const score =
        (/interview|hiring.process|recruitment|how.we.hire/.test(subject) ? 15 : 0) +
        (/career|jobs|handbook|join|people|values|about|engineering/.test(subject) ? 6 : 0) +
        (/company|team|culture|blog/.test(subject) ? 2 : 0) -
        (/privacy|terms|login|sign.in|cookie/.test(subject) ? 25 : 0);
      links.push({ url: target.href, label, score });
    } catch {}
  });
  $('nav,footer,header').remove();
  const root = $('main').length ? $('main') : $('body');
  root.find('p,li,h1,h2,h3,section,div').append('\n');
  return {
    url,
    title,
    company,
    text: root
      .text()
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .trim()
      .slice(0, 14000),
    links,
  };
}

export async function researchCompany(companyUrl, options = {}) {
  const retriever = options.retriever || new Retriever(options);
  const sources = [],
    pages = [],
    warnings = [];
  let origin;
  try {
    origin = new URL(companyUrl).origin;
  } catch {
    return {
      company: 'Unknown company',
      pages,
      sources,
      warnings: ['Company URL is invalid; research unavailable.'],
      hiring_process: '',
    };
  }
  const queue = [{ url: companyUrl, score: 100 }];
  const seen = new Set();
  while (queue.length && seen.size < 7) {
    queue.sort((a, b) => b.score - a.score);
    const item = queue.shift();
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    try {
      const page = cleanPage(await retriever.page(item.url));
      pages.push(page);
      sources.push({ url: page.url, title: page.title, kind: 'company', status: 'used' });
      for (const link of page.links)
        if (
          new URL(link.url).origin === origin &&
          link.score > 0 &&
          !seen.has(link.url) &&
          !queue.some((q) => q.url === link.url)
        )
          queue.push(link);
    } catch (error) {
      sources.push({
        url: item.url,
        title: 'Unavailable page',
        kind: 'company',
        status: 'skipped',
        detail: error.message,
      });
      warnings.push(`${item.url}: ${error.message}`);
    }
  }
  const hiring = pages.filter((p) =>
    /interview|hiring.process|recruitment|take.home|technical.round/i.test(p.text),
  );
  if (!hiring.length)
    warnings.push(
      'No hiring-process page was discovered. Questions are based on the posting; the interview format is unknown.',
    );
  const company = pages[0]?.company || new URL(companyUrl).hostname;
  // Hacker News Algolia is a public search API, not a guessed company path.
  if (!options.skipDiscussion) {
    const search = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(`${company} interview`)}&tags=comment&hitsPerPage=3`;
    try {
      await retriever.allowed(search);
      const result = JSON.parse((await retriever.raw(search, ['application/json'])).text);
      const hits = (result.hits || []).filter(
        (h) => h.comment_text && h.comment_text.toLowerCase().includes(company.toLowerCase()),
      );
      for (const hit of hits) {
        const url = `https://news.ycombinator.com/item?id=${hit.objectID}`;
        const text = load(hit.comment_text).text().slice(0, 1800);
        pages.push({ url, title: 'Public interview discussion (unverified)', text, links: [] });
        sources.push({
          url,
          title: 'Hacker News discussion',
          kind: 'public-discussion',
          status: 'used',
        });
      }
      if (!hits.length)
        warnings.push('No relevant public interview discussion found on Hacker News.');
    } catch (error) {
      warnings.push(`Public discussion search unavailable: ${error.message}`);
      sources.push({
        url: search,
        title: 'Public discussion search',
        kind: 'public-discussion',
        status: 'skipped',
        detail: error.message,
      });
    }
  }
  return {
    company,
    pages,
    sources,
    warnings,
    hiring_process: hiring
      .map((p) => `${p.url}\n${p.text}`)
      .join('\n')
      .slice(0, 12000),
  };
}
