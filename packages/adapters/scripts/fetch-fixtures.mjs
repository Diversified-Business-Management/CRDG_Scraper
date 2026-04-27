#!/usr/bin/env node
/**
 * One-off live-fixture fetcher. Run ONCE to populate test/fixtures.
 *
 *   node scripts/fetch-fixtures.mjs
 *
 * Polite: 1 req / sec, max 10 detail + 5 search fetches total.
 * If a fetch fails (Cloudflare 403, etc.) the script logs the error and
 * continues; the corresponding test will fall back to a synthetic fixture.
 */

import { fetch } from 'undici';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '..', 'test', 'fixtures');

const UA = 'Mozilla/5.0 (compatible; CRDG-Bot/1.0; +mailto:diversifiedbusinessmgmt@gmail.com)';

const TARGETS = [
  // encuentra24 — search + 2 details
  { slug: 'encuentra24', kind: 'search', url: 'https://www.encuentra24.com/costa-rica-en/real-estate-for-sale-in-guanacaste' },
  { slug: 'encuentra24', kind: 'listing-1', url: 'https://www.encuentra24.com/costa-rica-en/real-estate-for-sale' },
  { slug: 'encuentra24', kind: 'listing-2', url: 'https://www.encuentra24.com/costa-rica-en/real-estate-for-sale' },

  // point2homes-cr
  { slug: 'point2homes-cr', kind: 'search', url: 'https://www.point2homes.com/CR/Real-Estate.html' },

  // mlscr
  { slug: 'mlscr', kind: 'search', url: 'https://mls.cr/' },

  // coldwell banker
  { slug: 'coldwell-banker-cr', kind: 'search', url: 'https://www.coldwellbankercostarica.com/property-search/?status=for-sale' },

  // developers
  { slug: 'developers-generic', kind: 'listing-1', url: 'https://reservaconchal.com/sanara' },
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
      console.warn(`[skip] ${target.slug}/${target.kind} HTTP ${res.status} — leaving fixture for synthetic fallback.`);
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
