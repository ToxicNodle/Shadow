// News Signal Worker
//
// Polls Google News RSS for wrap-relevant keywords (fleet expansion,
// new vehicles, new distribution center, etc.) and auto-creates leads
// in the `companies` table with `source = 'news_signal'`.  Users can
// then promote these to their personal CRM with one click in Discover.
//
// Why this is unique:
//   - No competitor watches the news for wrap opportunities
//   - Every signal is a real, recent business event the prospect cares about
//     (perfect personalization hook for the outreach AI)
//
// Cost: $0.  Google News RSS is free + unauthenticated.

const KEYWORDS = [
  { phrase: 'fleet expansion',          category: 'fleet',         priority: 0.9 },
  { phrase: 'new distribution center',  category: 'fleet',         priority: 0.85 },
  { phrase: 'expanding fleet',          category: 'fleet',         priority: 0.8 },
  { phrase: 'new trucks',               category: 'fleet',         priority: 0.7 },
  { phrase: 'fleet of vehicles',        category: 'fleet',         priority: 0.7 },
  { phrase: 'racing team sponsorship',  category: 'racing',        priority: 0.9 },
  { phrase: 'new construction company', category: 'construction',  priority: 0.6 },
  { phrase: 'new restaurant chain',     category: 'fleet',         priority: 0.65 },
  { phrase: 'opening new location',     category: 'wallgraphics',  priority: 0.55 },
  { phrase: 'rebrand',                  category: 'fleet',         priority: 0.7 },
  { phrase: 'company rebrand',          category: 'fleet',         priority: 0.85 },
];

function googleNewsUrl(query, region = 'US') {
  const q = encodeURIComponent(`"${query}"`);
  return `https://news.google.com/rss/search?q=${q}&hl=en-${region}&gl=${region}&ceid=${region}:en`;
}

// Tiny RSS extractor — Google News RSS is simple, regex is fine here
// (no need for a full XML parser dep).  Returns an array of items.
function parseRss(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  const titleRegex = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/;
  const linkRegex = /<link>([\s\S]*?)<\/link>/;
  const pubDateRegex = /<pubDate>([\s\S]*?)<\/pubDate>/;
  const sourceRegex = /<source[^>]*>([\s\S]*?)<\/source>/;

  let m;
  while ((m = itemRegex.exec(xml)) !== null) {
    const block = m[1];
    const title = (block.match(titleRegex)?.[1] || '').trim();
    const link = (block.match(linkRegex)?.[1] || '').trim();
    const pubDate = (block.match(pubDateRegex)?.[1] || '').trim();
    const source = (block.match(sourceRegex)?.[1] || '').trim();
    if (title) items.push({ title, link, pubDate, source });
  }
  return items;
}

// Extract candidate company name from a news headline.  Heuristic:
// look for "{CompanyName} {verb}" patterns or capitalized phrases at the start.
function extractCompanyName(title) {
  // Strip the trailing " - SourceName" Google News appends
  const stripped = title.replace(/\s*[-—–]\s*[A-Z][A-Za-z0-9\s&.]+$/, '').trim();
  // Take leading capitalized phrase up to 4 words
  const m = stripped.match(/^([A-Z][A-Za-z0-9&'-]+(?:\s+[A-Z][A-Za-z0-9&'.-]+){0,3})/);
  if (m && m[1].length >= 3 && m[1].length <= 60) return m[1].trim();
  return null;
}

async function pollOnce(pool, opts = {}) {
  const lookbackMs = (opts.lookbackHours || 36) * 3600 * 1000;
  const now = Date.now();
  let totalCreated = 0;
  let totalSkipped = 0;

  for (const kw of KEYWORDS) {
    try {
      const res = await fetch(googleNewsUrl(kw.phrase));
      if (!res.ok) continue;
      const xml = await res.text();
      const items = parseRss(xml);

      for (const item of items.slice(0, 12)) {
        const pubTs = item.pubDate ? Date.parse(item.pubDate) : 0;
        if (!pubTs || now - pubTs > lookbackMs) { totalSkipped++; continue; }

        const company = extractCompanyName(item.title);
        if (!company) { totalSkipped++; continue; }

        // Source ID guarantees idempotency — same headline + day = same row
        const sourceId = `news:${pubTs}:${company.toLowerCase().slice(0, 60)}`;

        try {
          const result = await pool.query(`
            INSERT INTO companies (source, source_id, name, category, notes, created_at)
            VALUES ('news_signal', $1, $2, $3, $4, NOW())
            ON CONFLICT (source, source_id) DO NOTHING
            RETURNING id
          `, [
            sourceId,
            company,
            kw.category,
            `📰 ${item.title}\n${item.link || ''}`,
          ]);
          if (result.rowCount > 0) totalCreated++;
          else totalSkipped++;
        } catch (e) {
          // companies table may not have all columns — best-effort
          console.warn('[signalWorker] insert failed:', e.message);
        }
      }
    } catch (e) {
      console.warn(`[signalWorker] keyword "${kw.phrase}" failed:`, e.message);
    }
  }
  return { created: totalCreated, skipped: totalSkipped };
}

function startSignalWorker(pool, opts = {}) {
  const intervalHours = opts.intervalHours || 6;     // poll every 6 hours
  const startupDelayMs = 60_000;                      // wait 1 min after boot
  console.log(`· News Signal worker scheduled (every ${intervalHours}h, lookback 36h)`);

  setTimeout(async () => {
    try {
      const r = await pollOnce(pool, opts);
      console.log(`· News Signal first run: +${r.created} signals, ${r.skipped} skipped`);
    } catch (e) {
      console.warn('· News Signal first run failed:', e.message);
    }
  }, startupDelayMs);

  setInterval(async () => {
    try {
      const r = await pollOnce(pool, opts);
      if (r.created > 0) console.log(`· News Signal poll: +${r.created} signals`);
    } catch (e) {
      console.warn('· News Signal poll failed:', e.message);
    }
  }, intervalHours * 3600 * 1000);
}

module.exports = { startSignalWorker, pollOnce, parseRss, extractCompanyName };
