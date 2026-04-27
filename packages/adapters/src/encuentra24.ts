/**
 * Encuentra24 Costa Rica real-estate-for-sale adapter.
 *
 * - Static HTML on detail pages; we use cheerio.
 * - JSON-LD (Place / Product / Offer) is published on most detail pages; we prefer it.
 * - Pagination is `?p=N` on the search URL.
 *
 * Search URL pattern (per province):
 *   https://www.encuentra24.com/costa-rica-en/real-estate-for-sale-in-{province}
 */

import * as cheerio from 'cheerio';
import type { EnumerateOpts, RawListingPayload, RawPhoto, RegionSlug, SourceAdapter } from '@crdg/core';
import { fetchHtml } from './util/http.js';
import {
  absolutizeUrl,
  dedupePhotos,
  extractJsonLd,
  extractOpenGraph,
  findJsonLdByType,
} from './util/extract.js';

const SEARCH_BASE = 'https://www.encuentra24.com';

/** Encuentra24 indexes by province; we expose a CRDG-region → province map. */
const REGION_TO_PROVINCES: Record<RegionSlug, string[]> = {
  'central-pacific': ['puntarenas'],
  'guanacaste': ['guanacaste'],
  'central-valley': ['san-jose', 'heredia', 'alajuela', 'cartago'],
  'nicoya': ['guanacaste', 'puntarenas'],
  'caribbean': ['limon'],
  'south-pacific': ['puntarenas'],
};

function searchUrlForProvince(province: string, page: number): string {
  const path = `/costa-rica-en/real-estate-for-sale-in-${province}`;
  const qs = page > 1 ? `?p=${page}` : '';
  return `${SEARCH_BASE}${path}${qs}`;
}

// Encuentra24 detail URLs: /costa-rica-en/real-estate-for-sale-{category}/{slug}/{id}
// where {id} is purely numeric. Category index pages do NOT have a third segment.
const LISTING_HREF_RE = /^\/costa-rica-en\/real-estate-for-sale-[a-z-]+\/[^/?#]+\/\d+$/i;

function parseListingHrefs(html: string, base: string): string[] {
  const $ = cheerio.load(html);
  const urls = new Set<string>();
  $('a[href]').each((_i, el) => {
    const href = $(el).attr('href') || '';
    // Common search-card pattern; absolute or relative
    let path = href;
    try {
      if (/^https?:\/\//i.test(href)) {
        const u = new URL(href);
        path = u.pathname;
      }
    } catch {
      /* ignore */
    }
    if (LISTING_HREF_RE.test(path)) {
      const abs = absolutizeUrl(href, base);
      if (abs) urls.add(abs);
    }
  });
  return [...urls];
}

function provincesForOpts(regions?: RegionSlug[]): string[] {
  if (!regions || regions.length === 0) {
    return ['guanacaste', 'puntarenas', 'san-jose', 'heredia', 'alajuela', 'cartago', 'limon'];
  }
  const set = new Set<string>();
  for (const r of regions) for (const p of REGION_TO_PROVINCES[r] ?? []) set.add(p);
  return [...set];
}

async function* enumerateListingUrls(opts: EnumerateOpts): AsyncIterable<string> {
  const provinces = provincesForOpts(opts.regions);
  const seen = new Set<string>();
  let yielded = 0;
  const max = opts.maxListings ?? Number.POSITIVE_INFINITY;

  for (const province of provinces) {
    let page = 1;
    let emptyStreak = 0;
    while (page <= 50 && emptyStreak < 2) {
      if (opts.signal?.aborted) return;
      if (yielded >= max) return;
      const url = searchUrlForProvince(province, page);
      let html: string;
      try {
        const res = await fetchHtml(url, { signal: opts.signal });
        if (res.status >= 400) break;
        html = res.html;
      } catch {
        break;
      }
      const urls = parseListingHrefs(html, SEARCH_BASE);
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
      page++;
    }
  }
}

interface ParseResult {
  payload: RawListingPayload;
}

/** Public for tests: parse a single detail-page HTML. */
export function parseListingHtml(html: string, sourceUrl: string): ParseResult {
  const $ = cheerio.load(html);
  const ld = extractJsonLd(html);
  const og = extractOpenGraph(html);

  // 1) Try JSON-LD: encuentra24 publishes Product / Place / Offer / RealEstateListing
  const main =
    findJsonLdByType(ld, ['Product', 'RealEstateListing', 'Place', 'Residence', 'Offer']) ?? ld[0];

  // 2) Photos
  const photos: RawPhoto[] = [];
  const photoUrls = new Set<string>();
  if (main && typeof main === 'object') {
    const img = (main as { image?: unknown }).image;
    const imgArr = Array.isArray(img) ? img : (img ? [img] : []);
    for (const i of imgArr) {
      const url = typeof i === 'string' ? i : (i && typeof i === 'object' && typeof (i as { url?: string }).url === 'string' ? (i as { url: string }).url : '');
      const abs = absolutizeUrl(url, sourceUrl);
      if (abs) photoUrls.add(abs);
    }
  }
  // Fallback: gallery <img> tags inside main content
  $('img').each((_i, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src');
    const abs = absolutizeUrl(src ?? '', sourceUrl);
    if (!abs) return;
    // Filter obvious sprite/icon assets
    if (/\b(icon|sprite|logo|placeholder|avatar)\b/i.test(abs)) return;
    if (!/\.(jpe?g|png|webp|avif)/i.test(abs)) return;
    photoUrls.add(abs);
  });
  if (og['og:image']) {
    const abs = absolutizeUrl(og['og:image'], sourceUrl);
    if (abs) photoUrls.add(abs);
  }
  const deduped = dedupePhotos([...photoUrls]);
  for (let i = 0; i < deduped.length; i++) {
    const url = deduped[i];
    if (!url) continue;
    photos.push({ url, position: i });
  }

  // 3) source_listing_id — extract from URL slug or page
  const id = extractListingId(sourceUrl, $, main);

  // 4) raw_extracted bundle (passed to the AI extract stage)
  const raw_extracted: Record<string, unknown> = {
    json_ld: ld,
    og,
    title: og['og:title'] || $('h1').first().text().trim() || $('title').text().trim(),
    description: og['og:description'] || $('meta[name="description"]').attr('content') || '',
  };

  return {
    payload: {
      source_listing_id: id,
      source_url: sourceUrl,
      raw_html: html,
      raw_extracted,
      photos,
    },
  };
}

function extractListingId($url: string, $: cheerio.CheerioAPI, main: Record<string, unknown> | undefined): string {
  // Encuentra24 URLs end with `/<title-slug>/<id>` where id is a hex/numeric token.
  try {
    const u = new URL($url);
    const segs = u.pathname.split('/').filter(Boolean);
    const last = segs[segs.length - 1];
    if (last) return last;
  } catch {
    /* ignore */
  }
  if (main) {
    const sku = (main as { sku?: unknown; productID?: unknown; identifier?: unknown }).sku
      ?? (main as { productID?: unknown }).productID
      ?? (main as { identifier?: unknown }).identifier;
    if (typeof sku === 'string' && sku) return sku;
  }
  const dataId = $('[data-listing-id]').first().attr('data-listing-id');
  if (dataId) return dataId;
  return $url;
}

async function fetchListing(url: string): Promise<RawListingPayload> {
  const { html, finalUrl } = await fetchHtml(url);
  return parseListingHtml(html, finalUrl).payload;
}

const adapter: SourceAdapter = {
  slug: 'encuentra24',
  name: 'Encuentra24 Costa Rica',
  enumerateListingUrls,
  fetchListing,
};

export default adapter;
