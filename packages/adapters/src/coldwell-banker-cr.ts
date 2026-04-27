/**
 * Coldwell Banker Costa Rica adapter.
 *
 * Site is WordPress + an IDX plugin that registers a `listing` (or `property`)
 * custom post type. We try the WP REST API first; if it 404s or is hidden,
 * we fall back to HTML scraping the listing pages directly.
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

const BASE = 'https://www.coldwellbankercostarica.com';
const REST_CANDIDATES = [
  '/wp-json/wp/v2/listing',
  '/wp-json/wp/v2/property',
];
const HTML_LIST_PATH = '/costa-rica/property-for-sale';

interface WpRestPost {
  id: number;
  link?: string;
  slug?: string;
  title?: { rendered?: string };
  content?: { rendered?: string };
  meta?: Record<string, unknown>;
  _embedded?: { 'wp:featuredmedia'?: Array<{ source_url?: string }> };
}

async function tryRestEnumerate(opts: EnumerateOpts, max: number): Promise<string[] | null> {
  for (const path of REST_CANDIDATES) {
    let acc: string[] = [];
    let page = 1;
    let ok = false;
    while (page <= 20 && acc.length < max) {
      if (opts.signal?.aborted) break;
      const url = `${BASE}${path}?per_page=100&page=${page}&_embed=1`;
      try {
        const res = await fetchHtml(url, { signal: opts.signal, headers: { Accept: 'application/json' } });
        if (res.status === 404 || res.status === 401) break;
        if (res.status >= 400) break;
        const json = JSON.parse(res.html) as unknown;
        if (!Array.isArray(json)) break;
        ok = true;
        if (json.length === 0) break;
        for (const post of json as WpRestPost[]) {
          if (post && typeof post === 'object' && typeof post.link === 'string') {
            acc.push(post.link);
          }
        }
        page++;
      } catch {
        break;
      }
    }
    if (ok && acc.length > 0) return acc.slice(0, max);
  }
  return null;
}

async function* enumerateListingUrls(opts: EnumerateOpts): AsyncIterable<string> {
  const max = opts.maxListings ?? Number.POSITIVE_INFINITY;
  let yielded = 0;

  // Try REST first
  const fromRest = await tryRestEnumerate(opts, Number.isFinite(max) ? max : 200);
  if (fromRest && fromRest.length > 0) {
    for (const u of fromRest) {
      if (yielded >= max) return;
      yielded++;
      yield u;
    }
    return;
  }

  // Fallback to HTML pagination
  const seen = new Set<string>();
  let emptyStreak = 0;
  for (let page = 1; page <= 50 && emptyStreak < 2; page++) {
    if (opts.signal?.aborted) return;
    if (yielded >= max) return;
    const url = `${BASE}${HTML_LIST_PATH}${page > 1 ? `?page=${page}` : ''}`;
    let html: string;
    try {
      const res = await fetchHtml(url, { signal: opts.signal });
      if (res.status >= 400) break;
      html = res.html;
    } catch {
      break;
    }
    const $ = cheerio.load(html);
    let newOnPage = 0;
    $('a[href]').each((_i, el) => {
      const href = $(el).attr('href') || '';
      if (!/\/property\/|\/listing\//i.test(href)) return;
      const abs = absolutizeUrl(href, BASE);
      if (!abs || seen.has(abs)) return;
      seen.add(abs);
      newOnPage++;
    });
    for (const u of seen) {
      if (yielded >= max) return;
      yielded++;
      yield u;
    }
    if (newOnPage === 0) emptyStreak++; else emptyStreak = 0;
  }
}

export function parseListingHtml(html: string, sourceUrl: string): RawListingPayload {
  const $ = cheerio.load(html);
  const ld = extractJsonLd(html);
  const og = extractOpenGraph(html);

  const main = findJsonLdByType(ld, ['Residence', 'Place', 'Product', 'RealEstateListing', 'SingleFamilyResidence']) ?? ld[0];

  const photoUrls = new Set<string>();
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
    if (abs && /\.(jpe?g|png|webp|avif)/i.test(abs) && !/icon|logo|sprite|placeholder|avatar/i.test(abs)) {
      photoUrls.add(abs);
    }
  });
  if (og['og:image']) {
    const abs = absolutizeUrl(og['og:image'], sourceUrl);
    if (abs) photoUrls.add(abs);
  }
  const deduped = dedupePhotos([...photoUrls]);
  const photos: RawPhoto[] = deduped
    .filter((u): u is string => !!u)
    .map((url, position) => ({ url, position }));

  const id = extractId(sourceUrl, $, main);
  const raw_extracted: Record<string, unknown> = {
    json_ld: ld,
    og,
    title: og['og:title'] || $('h1').first().text().trim() || $('title').text().trim(),
    description: og['og:description'] || $('meta[name="description"]').attr('content') || '',
  };

  return {
    source_listing_id: id,
    source_url: sourceUrl,
    raw_html: html,
    raw_extracted,
    photos,
  };
}

function extractId(url: string, $: cheerio.CheerioAPI, main: Record<string, unknown> | undefined): string {
  try {
    const u = new URL(url);
    const segs = u.pathname.split('/').filter(Boolean);
    const last = segs[segs.length - 1];
    if (last) return last;
  } catch {
    /* ignore */
  }
  if (main) {
    const sku = (main as { sku?: unknown; identifier?: unknown }).sku
      ?? (main as { identifier?: unknown }).identifier;
    if (typeof sku === 'string' && sku) return sku;
  }
  const dataId = $('[data-listing-id]').first().attr('data-listing-id');
  if (dataId) return dataId;
  return url;
}

async function fetchListing(url: string): Promise<RawListingPayload> {
  const { html, finalUrl } = await fetchHtml(url);
  return parseListingHtml(html, finalUrl);
}

const adapter: SourceAdapter = {
  slug: 'coldwell-banker-cr',
  name: 'Coldwell Banker Costa Rica',
  enumerateListingUrls,
  fetchListing,
};

export default adapter;
