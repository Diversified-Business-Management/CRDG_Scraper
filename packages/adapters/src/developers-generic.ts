/**
 * Generic developer-site adapter.
 *
 * Reads a list of developer URLs from `source_configs.metadata.developer_urls`
 * (passed at runtime; for v1 we hard-code 2-3 known CRDG partner developers).
 *
 * For each URL, we fetch the HTML and rely on OpenGraph + JSON-LD as a
 * generic fallback parser. Many developer sites are single-page property
 * landing pages, so each URL is treated as a single "listing".
 */

import * as cheerio from 'cheerio';
import type { EnumerateOpts, RawListingPayload, RawPhoto, SourceAdapter } from '@crdg/core';
import { fetchHtml } from './util/http.js';
import {
  absolutizeUrl,
  dedupePhotos,
  extractJsonLd,
  extractOpenGraph,
  findJsonLdByType,
} from './util/extract.js';

/** Hard-coded CRDG partner developer landing pages for v1. */
export const DEFAULT_DEVELOPER_URLS = [
  'https://reservaconchal.com/sanara',
  'https://www.lasolasvillas.com/',
  'https://www.therealestate.cr/projects/azulparaiso',
];

let runtimeUrls: string[] | null = null;

/** Override the developer URL list at runtime (worker passes this from source_configs). */
export function setDeveloperUrls(urls: string[]): void {
  runtimeUrls = urls.slice();
}

function effectiveUrls(): string[] {
  return runtimeUrls && runtimeUrls.length > 0 ? runtimeUrls : DEFAULT_DEVELOPER_URLS;
}

async function* enumerateListingUrls(opts: EnumerateOpts): AsyncIterable<string> {
  const max = opts.maxListings ?? Number.POSITIVE_INFINITY;
  let yielded = 0;
  for (const url of effectiveUrls()) {
    if (opts.signal?.aborted) return;
    if (yielded >= max) return;
    yielded++;
    yield url;
  }
}

export function parseListingHtml(html: string, sourceUrl: string): RawListingPayload {
  const $ = cheerio.load(html);
  const ld = extractJsonLd(html);
  const og = extractOpenGraph(html);

  const main = findJsonLdByType(ld, ['Residence', 'Product', 'Place', 'RealEstateListing', 'Project', 'Apartment', 'House']) ?? ld[0];

  const photoUrls = new Set<string>();
  if (og['og:image']) {
    const abs = absolutizeUrl(og['og:image'], sourceUrl);
    if (abs) photoUrls.add(abs);
  }
  if (main && typeof main === 'object') {
    const img = (main as { image?: unknown }).image;
    const imgArr = Array.isArray(img) ? img : (img ? [img] : []);
    for (const i of imgArr) {
      const url = typeof i === 'string'
        ? i
        : (i && typeof i === 'object' && typeof (i as { url?: string }).url === 'string'
          ? (i as { url: string }).url
          : '');
      const abs = absolutizeUrl(url, sourceUrl);
      if (abs) photoUrls.add(abs);
    }
  }
  $('img').each((_i, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src');
    const abs = absolutizeUrl(src ?? '', sourceUrl);
    if (abs && /\.(jpe?g|png|webp|avif)/i.test(abs) && !/icon|logo|sprite|placeholder|avatar|favicon/i.test(abs)) {
      photoUrls.add(abs);
    }
  });
  const deduped = dedupePhotos([...photoUrls]);
  const photos: RawPhoto[] = deduped
    .filter((u): u is string => !!u)
    .map((url, position) => ({ url, position }));

  const title = og['og:title'] || $('h1').first().text().trim() || $('title').text().trim();
  const description = og['og:description'] || $('meta[name="description"]').attr('content') || '';

  // Use hostname + first path seg as a stable id; fall back to URL.
  const id = developerListingId(sourceUrl);

  const raw_extracted: Record<string, unknown> = {
    json_ld: ld,
    og,
    title,
    description,
    site_name: og['og:site_name'] || new URL(sourceUrl).hostname,
  };

  return {
    source_listing_id: id,
    source_url: sourceUrl,
    raw_html: html,
    raw_extracted,
    photos,
  };
}

function developerListingId(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, '').replace(/\/+/g, '-') || '-root';
    return `${u.hostname}${path}`;
  } catch {
    return url;
  }
}

async function fetchListing(url: string): Promise<RawListingPayload> {
  const { html, finalUrl } = await fetchHtml(url);
  return parseListingHtml(html, finalUrl);
}

const adapter: SourceAdapter = {
  slug: 'developers-generic',
  name: 'CRDG Partner Developers',
  enumerateListingUrls,
  fetchListing,
};

export default adapter;
