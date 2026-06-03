/**
 * PDF renderer — high-fidelity HTML → PDF via headless Chromium.
 *
 * Uses puppeteer-core + @sparticuz/chromium so the same code works
 * locally, on Railway, on Render, and on Lambda. The bundled
 * @sparticuz/chromium binary is auto-discovered; for local development on
 * macOS / Linux desktop, set PUPPETEER_EXECUTABLE_PATH to your installed
 * Chrome / Chromium / Brave binary to avoid downloading anything.
 *
 * Lazy-loads puppeteer so the rest of the server doesn't pay the import
 * cost on boot when PDFs aren't being generated.
 */

'use strict';

let _browser = null;
let _launching = null;

async function launchBrowser() {
  if (_browser && _browser.connected) return _browser;
  if (_launching) return _launching;

  _launching = (async () => {
    const puppeteer = require('puppeteer-core');
    let executablePath;
    let args;
    let headless;

    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      // Local dev — use the system Chrome/Chromium.
      executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
      args = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'];
      headless = 'new';
    } else {
      // Server / serverless — use the @sparticuz/chromium bundled binary.
      const chromium = require('@sparticuz/chromium');
      executablePath = await chromium.executablePath();
      args = chromium.args;
      headless = chromium.headless;
    }

    const browser = await puppeteer.launch({
      args,
      executablePath,
      headless,
      defaultViewport: { width: 1240, height: 1754, deviceScaleFactor: 2 },
    });
    _browser = browser;
    // Restart on crash so subsequent requests don't fail silently.
    browser.on('disconnected', () => { _browser = null; });
    return browser;
  })();

  try {
    return await _launching;
  } finally {
    _launching = null;
  }
}

/**
 * Render an HTML string to a print-quality PDF Buffer.
 *
 * @param {string} html      — full HTML document
 * @param {Object} [opts]
 * @param {string} [opts.format='Letter']  — 'Letter' | 'A4' | etc.
 * @param {Object} [opts.margin]           — { top, right, bottom, left } in CSS units
 * @param {string} [opts.headerTemplate]   — HTML template for top of every page
 * @param {string} [opts.footerTemplate]   — HTML template for bottom of every page
 * @param {boolean} [opts.printBackground=true]
 * @returns {Promise<Buffer>}
 */
async function renderPdf(html, opts = {}) {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  try {
    // setContent with networkidle0 so any inline references (e.g. Google
    // Static Maps satellite image) finish loading before we capture.
    await page.setContent(html, { waitUntil: ['load', 'networkidle0'], timeout: 30_000 });
    // Force print media so @media print CSS rules apply.
    await page.emulateMediaType('print');
    const pdf = await page.pdf({
      format: opts.format || 'Letter',
      printBackground: opts.printBackground !== false,
      displayHeaderFooter: Boolean(opts.headerTemplate || opts.footerTemplate),
      headerTemplate: opts.headerTemplate || '<span></span>',
      footerTemplate: opts.footerTemplate || '<span></span>',
      margin: opts.margin || { top: '0.6in', right: '0.4in', bottom: '0.6in', left: '0.4in' },
      preferCSSPageSize: false,
    });
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => {});
  }
}

// Standard HelioScout document chrome — applied to every PDF.
const DEFAULT_FOOTER = `
  <div style="width:100%;font-size:8px;color:#94a3b8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:0 0.4in;display:flex;justify-content:space-between;">
    <span>HelioScout · Commercial Solar Intelligence</span>
    <span>Confidential · Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
  </div>
`;

const DEFAULT_HEADER = `
  <div style="width:100%;font-size:8px;color:#cbd5e1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:0 0.4in;text-align:right;">
    Generated <span class="date"></span>
  </div>
`;

async function shutdown() {
  if (_browser) {
    try { await _browser.close(); } catch { /* non-fatal */ }
    _browser = null;
  }
}

module.exports = { renderPdf, launchBrowser, shutdown, DEFAULT_FOOTER, DEFAULT_HEADER };
