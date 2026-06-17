/**
 * Lazily initialised, shared Playwright Chromium browser.
 *
 * Only used for sources that need JS execution (e.g. mlscr).
 * Static-HTML sources should use the cheerio path via util/http.ts instead.
 */

import type { Browser } from 'playwright';
import { USER_AGENT } from './http.js';

let browserPromise: Promise<Browser> | null = null;
let registeredExitHook = false;

async function getBrowser(): Promise<Browser> {
  if (browserPromise) return browserPromise;
  browserPromise = (async () => {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
      ],
    });
    if (!registeredExitHook) {
      registeredExitHook = true;
      const close = async () => {
        try { await browser.close(); } catch { /* swallow */ }
      };
      process.once('exit', () => { void close(); });
      process.once('SIGINT', () => { void close().then(() => process.exit(130)); });
      process.once('SIGTERM', () => { void close().then(() => process.exit(143)); });
    }
    return browser;
  })();
  return browserPromise;
}

export async function closeBrowser(): Promise<void> {
  if (!browserPromise) return;
  const b = await browserPromise;
  browserPromise = null;
  try { await b.close(); } catch { /* swallow */ }
}

export interface RenderPageOpts {
  /** Wait until network is idle. Defaults true. */
  waitForNetworkIdle?: boolean;
  /** Per-render timeout in ms. */
  timeoutMs?: number;
  /** CSS selector to wait for before extracting HTML. */
  waitForSelector?: string;
  /** Block images & media for speed. Defaults true. */
  blockMedia?: boolean;
  /** Forwarded abort signal. */
  signal?: AbortSignal;
}

export interface RenderPageResult {
  html: string;
  status: number;
  finalUrl: string;
}

export async function renderPage(url: string, opts: RenderPageOpts = {}): Promise<RenderPageResult> {
  const browser = await getBrowser();
  const ctx = await browser.newContext({
    userAgent: USER_AGENT,
    locale: 'en-US',
    viewport: { width: 1280, height: 1800 },
  });
  const page = await ctx.newPage();
  const blockMedia = opts.blockMedia ?? true;
  if (blockMedia) {
    await page.route('**/*', (route) => {
      const t = route.request().resourceType();
      if (t === 'image' || t === 'media' || t === 'font') return route.abort();
      return route.continue();
    });
  }
  try {
    if (opts.signal?.aborted) throw new Error('Aborted');
    const onAbort = () => { void page.close(); };
    if (opts.signal) opts.signal.addEventListener('abort', onAbort, { once: true });

    const resp = await page.goto(url, {
      waitUntil: opts.waitForNetworkIdle === false ? 'load' : 'networkidle',
      timeout: opts.timeoutMs ?? 30_000,
    });
    if (opts.waitForSelector) {
      await page.waitForSelector(opts.waitForSelector, { timeout: opts.timeoutMs ?? 30_000 });
    }
    const html = await page.content();
    return {
      html,
      status: resp?.status() ?? 0,
      finalUrl: page.url(),
    };
  } finally {
    await page.close().catch(() => undefined);
    await ctx.close().catch(() => undefined);
  }
}
