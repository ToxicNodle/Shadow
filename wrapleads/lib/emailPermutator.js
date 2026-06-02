// Email Permutator + lightweight verification
//
// Generates plausible email addresses from a contact name + domain, then
// (optionally) probes them via a) MX-record lookup, b) SMTP RCPT TO handshake.
// All operations are free — no third-party API keys required.
//
// SMTP probing is best-effort: many providers (Gmail, O365) deliberately
// accept-all to defeat enumeration. Treat results as "candidate", not "verified".

const dns = require('dns').promises;
const net = require('net');

// ── Permutation generation ──────────────────────────────────────────────────
// Given a name like "John Smith" and domain "acme.com", produce
// `john@`, `john.smith@`, `jsmith@`, `john.s@`, `j.smith@`, etc.
// Ordered by industry-typical likelihood (most common business format first).
function generatePermutations(fullName, domain) {
  if (!fullName || !domain) return [];
  const clean = String(fullName).trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[^a-z\s'-]/g, ' ');
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return [];

  const d = String(domain).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const first = parts[0];
  const last = parts.length > 1 ? parts[parts.length - 1] : null;
  const fi = first[0];
  const li = last ? last[0] : null;

  const locals = [];
  if (last) {
    locals.push(
      `${first}.${last}`,   // john.smith — most common B2B
      `${first}${last}`,    // johnsmith
      `${fi}${last}`,       // jsmith
      `${first}_${last}`,   // john_smith
      `${first}-${last}`,   // john-smith
      `${first}${li}`,      // johns
      `${fi}.${last}`,      // j.smith
      `${first}.${li}`,     // john.s
      `${last}${fi}`,       // smithj
      `${last}.${first}`,   // smith.john
    );
  }
  locals.push(first);       // john
  if (last) locals.push(last); // smith

  // Generic / role-based catch-alls (lower confidence)
  locals.push('info', 'contact', 'hello', 'sales');

  // Dedupe in insertion order
  const seen = new Set();
  const uniq = locals.filter((l) => (seen.has(l) ? false : (seen.add(l), true)));

  return uniq.map((local) => ({
    email: `${local}@${d}`,
    confidence: scoreFormat(local, !!last),
    format: describeFormat(local, first, last),
  }));
}

function scoreFormat(local, hasLast) {
  if (['info', 'contact', 'hello', 'sales'].includes(local)) return 0.15;
  if (!hasLast) return 0.35;
  if (local.includes('.')) return 0.85;   // first.last / j.last
  if (local.includes('_') || local.includes('-')) return 0.55;
  if (local.length <= 4) return 0.50;     // jsmith
  return 0.65;                            // johnsmith
}

function describeFormat(local, first, last) {
  if (['info', 'contact', 'hello', 'sales'].includes(local)) return 'role';
  if (!last) return 'first';
  if (local === `${first}.${last}`) return 'first.last';
  if (local === `${first}${last}`) return 'firstlast';
  if (local === `${first[0]}${last}`) return 'flast';
  if (local === `${first}${last[0]}`) return 'firstl';
  if (local === `${first}.${last[0]}`) return 'first.l';
  if (local === `${first[0]}.${last}`) return 'f.last';
  return 'other';
}

// ── MX record check ────────────────────────────────────────────────────────
// A domain with valid MX records can accept mail. Doesn't prove the local
// part exists, but proves the domain is reachable.
async function checkMx(domain) {
  try {
    const records = await dns.resolveMx(domain);
    return {
      ok: records.length > 0,
      provider: detectProvider(records),
      records: records.sort((a, b) => a.priority - b.priority).slice(0, 3),
    };
  } catch (e) {
    return { ok: false, error: e.code || e.message };
  }
}

function detectProvider(records) {
  const hosts = records.map((r) => r.exchange.toLowerCase()).join(' ');
  if (/google|googlemail/.test(hosts)) return 'google';
  if (/outlook|office365|protection\.outlook/.test(hosts)) return 'microsoft';
  if (/zoho/.test(hosts)) return 'zoho';
  if (/protonmail/.test(hosts)) return 'proton';
  if (/fastmail/.test(hosts)) return 'fastmail';
  return 'other';
}

// ── SMTP RCPT TO probe ─────────────────────────────────────────────────────
// Connects to the MX, runs HELO/MAIL FROM/RCPT TO, parses response code.
// Returns: 'ok' (250), 'rejected' (550), 'unknown' (catch-all / timeout / blocked).
// IMPORTANT: Google + Microsoft almost always return ok regardless — use sparingly.
function smtpProbe(email, mxHost, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const socket = net.createConnection(25, mxHost);
    let stage = 'greet';
    let result = 'unknown';

    const cleanup = (r) => {
      result = r;
      try { socket.end('QUIT\r\n'); } catch {}
      socket.destroy();
    };

    socket.setTimeout(timeoutMs, () => cleanup('timeout'));
    socket.on('error', () => cleanup('connection_error'));
    socket.on('close', () => resolve({ result, email }));

    socket.on('data', (chunk) => {
      const text = chunk.toString();
      const codeMatch = text.match(/^(\d{3})/m);
      const code = codeMatch ? parseInt(codeMatch[1], 10) : 0;
      if (stage === 'greet' && code === 220) {
        socket.write('HELO wrapos.app\r\n');
        stage = 'helo';
      } else if (stage === 'helo' && code === 250) {
        socket.write('MAIL FROM:<probe@wrapos.app>\r\n');
        stage = 'mail';
      } else if (stage === 'mail' && code === 250) {
        socket.write(`RCPT TO:<${email}>\r\n`);
        stage = 'rcpt';
      } else if (stage === 'rcpt') {
        if (code === 250 || code === 251) cleanup('ok');
        else if (code >= 500 && code < 600) cleanup('rejected');
        else cleanup('unknown');
      } else if (code >= 400) {
        cleanup('blocked');
      }
    });
  });
}

// ── Public API ──────────────────────────────────────────────────────────────
// findEmails(name, domain, opts) → ranked candidate list.
// opts.probe (default false): if true, runs SMTP RCPT on top candidates.
// Returns: { candidates: [{ email, confidence, format, smtp? }], mx }
async function findEmails(fullName, domain, opts = {}) {
  const candidates = generatePermutations(fullName, domain);
  if (candidates.length === 0) {
    return { candidates: [], mx: null, error: 'name_or_domain_missing' };
  }

  const mx = await checkMx(domain);
  if (!mx.ok) {
    return { candidates, mx, error: 'no_mx_record' };
  }

  // Don't probe accept-all providers — wastes time, returns false positives.
  const shouldProbe = opts.probe && !['google', 'microsoft'].includes(mx.provider);
  if (shouldProbe && mx.records.length > 0) {
    const top = candidates.filter((c) => c.confidence >= 0.5).slice(0, 5);
    const probed = await Promise.all(
      top.map((c) => smtpProbe(c.email, mx.records[0].exchange).catch(() => ({ result: 'unknown' })))
    );
    for (let i = 0; i < top.length; i++) {
      top[i].smtp = probed[i].result;
      if (probed[i].result === 'ok') top[i].confidence = Math.min(0.95, top[i].confidence + 0.15);
      else if (probed[i].result === 'rejected') top[i].confidence = 0.05;
    }
  }

  candidates.sort((a, b) => b.confidence - a.confidence);
  return { candidates, mx };
}

// ── Simple permutation helper (no async, no MX check) ─────────────────────
// Used by /leads/bulk-find-emails for lightweight, synchronous candidate
// generation when the caller just wants a list without any network I/O.
function permutate(firstName, lastName, domain) {
  const f = String(firstName || '').toLowerCase().replace(/[^a-z]/g, '');
  const l = String(lastName || '').toLowerCase().replace(/[^a-z]/g, '');
  if (!f || !domain) return [];
  const d = String(domain).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const candidates = [
    `${f}@${d}`,
    `${f}.${l}@${d}`,
    `${f[0]}${l}@${d}`,
    `${f}${l[0] ?? ''}@${d}`,
    `${l}.${f}@${d}`,
    `${f}${l}@${d}`,
    `info@${d}`,
    `contact@${d}`,
    `hello@${d}`,
  ].filter((e, i, a) => e.includes('@') && a.indexOf(e) === i);
  return candidates;
}

module.exports = { generatePermutations, checkMx, smtpProbe, findEmails, permutate };
