/**
 * Point2Homes Costa Rica adapter.
 *
 * - Static HTML; cheerio.
 * - Search at https://www.point2homes.com/CR/Real-Estate.html?page=N
 * - Detail URLs look like /CR/Homes-For-Sale/<location>/<slug>/<id>.html
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

const BASE = 'https://www.point2homes.com';
const SEARCH_PATH = '/CR/Real-Estate.html';

const LISTING_HREF_RE = /\/CR\/(?:Homes-For-Sale|Real-Estate)\/[^"' >]*\.html/i;

function searchUrl(page: number): string {
  return `${BASE}${SEARCH_PATH}${page > 1 ? `?page=${page}` : ''}`;
}

function parseListingHrefs(html: string): string[] {
  const $ = cheerio.load(html);
  const urls = new Set<string>();
  $('a[href]').each((_i, el) => {
    const href = $(el).attr('href') || '';
    if (!LISTING_HREF_RE.test(href)) return;
    const abs = absolutizeUrl(href, BASE);
    // Avoid the search page itself
    if (abs && !/Real-Estate\.html(?:$|\?)/i.test(abs)) urls.add(abs);
  });
  return [...urls];
}

async function* enumerateListingUrls(opts: EnumerateOpts): AsyncIterable<string> {
  const max = opts.maxListings ?? Number.POSITIVE_INFINITY;
  let yielded = 0;
  let emptyStreak = 0;
  const seen = new Set<string>();
  for (let page = 1; page <= 100 && emptyStreak < 2; page++) {
    if (opts.signal?.aborted) return;
    if (yielded >= max) return;
    let html: string;
    try {
      const res = await fetchHtml(searchUrl(page), { signal: opts.signal });
      if (res.status >= 400) break;
      html = res.html;
    } catch {
      break;
    }
    const urls = parseListingHrefs(html);
    let newOnPage = 0;
    for (const u of urls) {
      if (seen.has(u)) continue;
      seen.add(u);
      newOnPage++;
      yielded++;
      yield u;
      if (yielded >= max) return;
    }
    if (newOnPage === 0) emptyStreak++; else emptyStreak = 0;
  }
}

export function parseListingHtml(html: string, sourceUrl: string): RawListingPayload {
  const $ = cheerio.load(html);
  const ld = extractJsonLd(html);
  const og = extractOpenGraph(html);

  const main = findJsonLdByType(ld, ['SingleFamilyResidence', 'Residence', 'Place', 'Product', 'RealEstateListing']) ?? ld[0];

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
  $('.gallery img, .photo-gallery img, .property-photos img, picture img, [data-src]').each((_i, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-original');
    const abs = absolutizeUrl(src ?? '', sourceUrl);
    if (abs && /\.(jpe?g|png|webp|avif)/i.test(abs) && !/icon|logo|sprite|placeholder/i.test(abs)) {
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
  // Point2Homes URLs include a numeric id near the end: /Homes-For-Sale/.../slug/12345678.html
  try {
    const u = new URL(url);
    const m = u.pathname.match(/(\d{6,})(?:\.html)?$/);
    if (m && m[1]) return m[1];
    const segs = u.pathname.split('/').filter(Boolean);
    const last = segs[segs.length - 1];
    if (last) return last.replace(/\.html$/i, '');
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
  slug: 'point2homes-cr',
  name: 'Point2Homes Costa Rica',
  enumerateListingUrls,
  fetchListing,
};

export default adapter;
