#!/usr/bin/env node
/** Third-pass: fetch real mlscr detail pages and try CB CR. */

import { fetch } from 'undici';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '..', 'test', 'fixtures');

const UA = 'Mozilla/5.0 (compatible; CRDG-Bot/1.0; +mailto:diversifiedbusinessmgmt@gmail.com)';

const TARGETS = [
  { slug: 'mlscr', kind: 'listing-1', url: 'https://mls.cr/properties/orange-house/' },
  { slug: 'mlscr', kind: 'listing-2', url: 'https://mls.cr/properties/spectacular-ocean-view-farm/' },
  // CB CR — try the main domain root and listings index
  { slug: 'coldwell-banker-cr', kind: 'home', url: 'https://www.coldwellbankercostarica.com/' },
  { slug: 'developers-generic', kind: 'listing-2', url: 'https://www.therealestate.cr/' },
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
  for (const t of TARGETS) {
    await fetchOne(t);
    await sleep(1100);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
