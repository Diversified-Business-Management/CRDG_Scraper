#!/usr/bin/env node
/**
 * One-off live-fixture fetcher. Run ONCE to populate test/fixtures.
 *
 *   node scripts/fetch-fixtures.mjs
 *
 * Polite: 1 req / sec, max ~14 fetches total.
 * If a fetch fails (Cloudflare 403, etc.) the script logs the error and
 * continues; the corresponding test will use the synthetic fallback fixture
 * already committed under test/fixtures/.
 *
 * Known status (last run 2026-04-27):
 *   encuentra24         OK (search index page is JS-rendered; 2 detail pages OK)
 *   point2homes-cr      403 Cloudflare — synthetic fixtures used
 *   mlscr               OK (despite being marketed as JS-rendered, mls.cr WP
 *                       theme inlines listing data in raw HTML)
 *   coldwell-banker-cr  OK (after we found /property/{slug}/{id} URL pattern)
 *   developers-generic  OK (reservaconchal.com)
 */

import { fetch } from 'undici';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '..', 'test', 'fixtures');

const UA = 'Mozilla/5.0 (compatible; CRDG-Bot/1.0; +mailto:diversifiedbusinessmgmt@gmail.com)';

const TARGETS = [
  // encuentra24
  { slug: 'encuentra24', kind: 'search-live-shell', url: 'https://www.encuentra24.com/costa-rica-en/real-estate-for-sale-in-guanacaste' },
  { slug: 'encuentra24', kind: 'listing-1', url: 'https://www.encuentra24.com/costa-rica-en/real-estate-for-sale-houses-homes/contemporary-two-story-home-for-sale-in-guachipelin-escazu-499-000/31381092' },
  { slug: 'encuentra24', kind: 'listing-2', url: 'https://www.encuentra24.com/costa-rica-en/real-estate-for-sale-apartments-condos/modern-furnished-apartment-for-sale-high-floor-nucleo-sabana-ideal-for-investment/32110136' },

  // point2homes — known to 403; left here so the script tries (and fails) for visibility
  { slug: 'point2homes-cr', kind: 'search-live', url: 'https://www.point2homes.com/CR/Real-Estate.html' },

  // mlscr
  { slug: 'mlscr', kind: 'search', url: 'https://mls.cr/' },
  { slug: 'mlscr', kind: 'listing-1', url: 'https://mls.cr/properties/orange-house/' },
  { slug: 'mlscr', kind: 'listing-2', url: 'https://mls.cr/properties/spectacular-ocean-view-farm/' },

  // coldwell banker
  { slug: 'coldwell-banker-cr', kind: 'search', url: 'https://www.coldwellbankercostarica.com/costa-rica/property-for-sale' },
  { slug: 'coldwell-banker-cr', kind: 'listing-1', url: 'https://www.coldwellbankercostarica.com/property/1-bed-commercial-for-sale-in-santa-ana/14598' },
  { slug: 'coldwell-banker-cr', kind: 'listing-2', url: 'https://www.coldwellbankercostarica.com/property/land-for-sale-in-playa-san-miguel/14594' },

  // developer pages (CRDG partners)
  { slug: 'developers-generic', kind: 'listing-1', url: 'https://reservaconchal.com/sanara' },
  { slug: 'developers-generic', kind: 'listing-2', url: 'https://reservaconchal.com/real-state/' },
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
      console.warn(`[skip] ${target.slug}/${target.kind} HTTP ${res.status} — synthetic fallback in place`);
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
