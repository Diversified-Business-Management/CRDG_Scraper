#!/usr/bin/env node
/**
 * Second-pass fixture fetch: now that we know the real URL patterns,
 * grab actual detail pages and a couple of fallback search pages.
 */

import { fetch } from 'undici';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '..', 'test', 'fixtures');

const UA = 'Mozilla/5.0 (compatible; CRDG-Bot/1.0; +mailto:diversifiedbusinessmgmt@gmail.com)';

const TARGETS = [
  // Real encuentra24 detail pages
  { slug: 'encuentra24', kind: 'listing-1', url: 'https://www.encuentra24.com/costa-rica-en/real-estate-for-sale-houses-homes/contemporary-two-story-home-for-sale-in-guachipelin-escazu-499-000/31381092' },
  { slug: 'encuentra24', kind: 'listing-2', url: 'https://www.encuentra24.com/costa-rica-en/real-estate-for-sale-apartments-condos/modern-furnished-apartment-for-sale-high-floor-nucleo-sabana-ideal-for-investment/32110136' },

  // point2homes detail attempts (fallback to homepage if blocked)
  { slug: 'point2homes-cr', kind: 'listing-1', url: 'https://www.point2homes.com/CR/Homes-For-Sale.html' },
];

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function fetchOne(target) {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 30_000);
    const res = await fetch(target.url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: ac.signal,
      redirect: 'follow',
    });
    clearTimeout(t);
    const html = await res.text();
    if (res.status >= 400) {
      console.warn(`[skip] ${target.slug}/${target.kind} HTTP ${res.status}`);
      return;
    }
    const fname = `${target.slug}-${target.kind}.html`;
    await writeFile(join(FIXTURE_DIR, fname), html, 'utf8');
    console.log(`[ok ] ${fname} (${(html.length / 1024).toFixed(1)} KB) <- ${target.url}`);
  } catch (err) {
    console.warn(`[err] ${target.slug}/${target.kind} ${err?.message || err}`);
  }
}

async function main() {
  await mkdir(FIXTURE_DIR, { recursive: true });
  for (const t of TARGETS) {
    await fetchOne(t);
    await sleep(1100);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
