/**
 * MLS Costa Rica adapter (mls.cr / mlscr.com).
 *
 * Detail pages are JS-rendered, so we use Playwright to capture HTML after
 * networkidle. Search/list page is also JS-rendered.
 */

import * as cheerio from 'cheerio';
import type { EnumerateOpts, RawListingPayload, RawPhoto, SourceAdapter } from '@crdg/core';
import { renderPage } from './util/playwright.js';
import {
  absolutizeUrl,
  dedupePhotos,
  extractJsonLd,
  extractOpenGraph,
  findJsonLdByType,
} from './util/extract.js';

const BASE = 'https://mls.cr';
const SEARCH_PATH = '/search/?listing_type=sale';

// mls.cr uses WordPress with custom post type slugs at /properties/{slug}/
const LISTING_HREF_RE = /^https?:\/\/(?:www\.)?mls\.cr\/properties\/[^"' >/]+\/?$/i;

function searchUrl(page: number): string {
  const sep = SEARCH_PATH.includes('?') ? '&' : '?';
  return `${BASE}${SEARCH_PATH}${page > 1 ? `${sep}page=${page}` : ''}`;
}

function parseListingHrefs(html: string): string[] {
  const $ = cheerio.load(html);
  const urls = new Set<string>();
  $('a[href]').each((_i, el) => {
    const href = $(el).attr('href') || '';
    if (LISTING_HREF_RE.test(href)) {
      const abs = absolutizeUrl(href, BASE);
      if (abs) urls.add(abs);
    }
  });
  return [...urls];
}

async function* enumerateListingUrls(opts: EnumerateOpts): AsyncIterable<string> {
  const max = opts.maxListings ?? Number.POSITIVE_INFINITY;
  let yielded = 0;
  let emptyStreak = 0;
  const seen = new Set<string>();
  for (let page = 1; page <= 50 && emptyStreak < 2; page++) {
    if (opts.signal?.aborted) return;
    if (yielded >= max) return;
    let html: string;
    try {
      const res = await renderPage(searchUrl(page), { signal: opts.signal });
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
    const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy');
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
    mls_id: $('[data-mls-id], .mls-id, [class*="mls"]').first().text().trim() || undefined,
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
    if (last) return last.replace(/\.html?$/i, '');
  } catch {
    /* ignore */
  }
  if (main) {
    const sku = (main as { sku?: unknown; identifier?: unknown }).sku
      ?? (main as { identifier?: unknown }).identifier;
    if (typeof sku === 'string' && sku) return sku;
  }
  const dataId = $('[data-listing-id], [data-mls-id]').first().attr('data-listing-id')
    || $('[data-mls-id]').first().attr('data-mls-id');
  if (dataId) return dataId;
  return url;
}

async function fetchListing(url: string): Promise<RawListingPayload> {
  const { html, finalUrl } = await renderPage(url);
  return parseListingHtml(html, finalUrl);
}

const adapter: SourceAdapter = {
  slug: 'mlscr',
  name: 'MLS Costa Rica',
  enumerateListingUrls,
  fetchListing,
};

export default adapter;
