/**
 * Per-source adapter verification harness.
 *
 * For a single source slug:
 *   1. Fetch the start URL(s) and report what listing URLs the regex matched.
 *   2. Fetch ONE detail page and dump the parsed RawListingPayload.
 *   3. Print a coverage report so we can see what the adapter actually yields
 *      before burning AI credits on a bulk scrape.
 *
 * Usage:
 *   npx tsx apps/worker/src/verify.ts <source-slug>
 *   npx tsx apps/worker/src/verify.ts --all
 */
import { resolveAdapter } from './adapter-loader.js';
import { pgQuery } from '@crdg/core';
import type { SourceAdapter, RawListingPayload } from '@crdg/core';

interface SourceConfigRow {
  slug: string;
  metadata: { start_urls?: string[]; listing_url_regex?: string } | null;
}

async function loadConfig(slug: string): Promise<SourceConfigRow | null> {
  const rows = await pgQuery<SourceConfigRow>(
    `select s.slug, sc.metadata
       from sources s join source_configs sc on sc.source_id = s.id
      where s.slug = $1`,
    [slug],
  );
  return rows[0] ?? null;
}

async function verifyOne(slug: string): Promise<{ slug: string; ok: boolean; urlCount: number; firstFields: number; firstTitle: string | null }> {
  console.log(`\n━━━ ${slug} ━━━`);
  const config = await loadConfig(slug);
  console.log('  config.metadata:', JSON.stringify(config?.metadata ?? {}));
  let adapter: SourceAdapter;
  try {
    adapter = await resolveAdapter(slug);
  } catch (e) {
    console.log('  ✗ adapter not found:', (e as Error).message);
    return { slug, ok: false, urlCount: 0, firstFields: 0, firstTitle: null };
  }

  // Step 1: enumerate up to 5 listing URLs
  const urls: string[] = [];
  const start = Date.now();
  try {
    const iter = adapter.enumerateListingUrls({ maxListings: 5 });
    for await (const u of iter) {
      urls.push(u);
      if (urls.length >= 5) break;
    }
  } catch (e) {
    console.log('  ✗ enumerate threw:', (e as Error).message);
  }
  console.log(`  enumerate → ${urls.length} URLs in ${Math.round((Date.now() - start) / 1000)}s`);
  for (const u of urls.slice(0, 3)) console.log('    -', u);

  if (urls.length === 0) {
    console.log('  ✗ adapter yielded 0 URLs — check start_urls / listing_url_regex / site availability');
    return { slug, ok: false, urlCount: 0, firstFields: 0, firstTitle: null };
  }

  // Step 2: fetch the first one and inspect what the adapter parses
  console.log(`  fetching first listing: ${urls[0]}`);
  let payload: RawListingPayload | null = null;
  try {
    payload = await adapter.fetchListing(urls[0]!);
  } catch (e) {
    console.log('  ✗ fetchListing threw:', (e as Error).message);
    return { slug, ok: false, urlCount: urls.length, firstFields: 0, firstTitle: null };
  }

  const title = (payload.raw_extracted?.['title'] as string) ?? '';
  const fieldsHave = Object.keys(payload.raw_extracted ?? {}).filter(k => {
    const v = (payload!.raw_extracted as Record<string, unknown>)[k];
    return v != null && v !== '' && !(Array.isArray(v) && v.length === 0);
  }).length;
  const photoCount = payload.photos?.length ?? 0;
  const htmlLen = payload.raw_html?.length ?? 0;
  const breadcrumbsLen = payload.breadcrumbs?.length ?? 0;

  console.log('  ✓ fetched');
  console.log('    title          :', title.slice(0, 60) || '(empty)');
  console.log('    raw_html bytes :', htmlLen);
  console.log('    photos         :', photoCount);
  console.log('    breadcrumbs    :', breadcrumbsLen, breadcrumbsLen ? `→ ${JSON.stringify(payload.breadcrumbs)}` : '');
  console.log('    raw_extracted keys populated:', fieldsHave);

  const ok = htmlLen > 5000 && (photoCount > 0 || title.length > 0);
  console.log(`  → ${ok ? '✓ usable' : '✗ thin output'}`);
  return { slug, ok, urlCount: urls.length, firstFields: fieldsHave, firstTitle: title.slice(0, 60) || null };
}

const SLUGS_DEFAULT = [
  'encuentra24', 'mlscr', 'coldwell-banker-cr', 'coldwell-cb-tamarindo',
  'realtor-com-cr', 're-cr', 'sothebys-cr', 'dominical-realty',
  'two-cr-real-estate', 'cr-dream-makers', 'rpm-real-estate-cr',
  'properties-in-cr', 'point2homes-cr', 'developers-generic',
];

async function main() {
  const arg = process.argv[2];
  const slugs = arg === '--all' || !arg ? SLUGS_DEFAULT : [arg];
  const results: Array<Awaited<ReturnType<typeof verifyOne>>> = [];
  for (const slug of slugs) {
    results.push(await verifyOne(slug));
  }
  console.log('\n━━━ SUMMARY ━━━');
  for (const r of results) {
    const status = r.ok ? '✓' : '✗';
    console.log(`  ${status} ${r.slug.padEnd(24)} urls=${r.urlCount} fields=${r.firstFields} title="${r.firstTitle ?? ''}"`);
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
