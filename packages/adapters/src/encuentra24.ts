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

/** Encuentra24 organizes by category, with province as a search filter. */
const CATEGORIES = [
  'real-estate-for-sale-houses-homes',
  'real-estate-for-sale-apartments-condos',
  'real-estate-for-sale-beachfront-homes-and-lots',
  'real-estate-for-sale-farms',
  'real-estate-for-sale-commercial',
  'real-estate-for-sale-buildings',
] as const;

const REGION_TO_PROVINCES: Record<RegionSlug, string[]> = {
  'central-pacific': ['puntarenas'],
  'guanacaste': ['guanacaste'],
  'central-valley': ['san-jose', 'heredia', 'alajuela', 'cartago'],
  'nicoya': ['guanacaste', 'puntarenas'],
  'caribbean': ['limon'],
  'south-pacific': ['puntarenas'],
};

/** Encuentra24's province filter param appears as `q[province]` in some URLs;
 * province-aware filtering doesn't reliably narrow the listing set, so we
 * walk all categories and filter regions downstream via geocoding. */
function searchUrlForCategory(category: string, page: number): string {
  const qs = page > 1 ? `?p=${page}` : '';
  return `${SEARCH_BASE}/costa-rica-en/${category}${qs}`;
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

// silence unused-warning while we keep REGION_TO_PROVINCES for future use
void REGION_TO_PROVINCES;

async function* enumerateListingUrls(opts: EnumerateOpts): AsyncIterable<string> {
  const seen = new Set<string>();
  let yielded = 0;
  const max = opts.maxListings ?? Number.POSITIVE_INFINITY;

  for (const category of CATEGORIES) {
    let page = 1;
    let emptyStreak = 0;
    while (page <= 50 && emptyStreak < 2) {
      if (opts.signal?.aborted) return;
      if (yielded >= max) return;
      const url = searchUrlForCategory(category, page);
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

  // 4) Breadcrumbs — Encuentra24 publishes BreadcrumbList in JSON-LD AND a visible nav.
  const breadcrumbs = extractBreadcrumbs($, ld);

  // 5) Agent / brokerage info from page DOM
  const agentInfo = extractAgentInfo($);

  // 6) raw_extracted bundle (passed to the AI extract stage)
  const raw_extracted: Record<string, unknown> = {
    json_ld: ld,
    og,
    title: og['og:title'] || $('h1').first().text().trim() || $('title').text().trim(),
    description: og['og:description'] || $('meta[name="description"]').attr('content') || '',
    breadcrumbs,
    agent: agentInfo,
    // Raw page text from the listing detail block helps AI find features in prose
    detail_text: $('main, [class*="detail"], [class*="listing"]').first().text().trim().slice(0, 5000),
  };

  return {
    payload: {
      source_listing_id: id,
      source_url: sourceUrl,
      raw_html: html,
      raw_extracted,
      breadcrumbs,
      photos,
    },
  };
}

function extractBreadcrumbs($: cheerio.CheerioAPI, ld: unknown[]): string[] {
  // Encuentra24 has site-wide category nav ("Real Estate", "Jobs & Services", "Cars")
  // AND a listing-specific location breadcrumb. We want the LATTER.
  // The location breadcrumb is typically province > canton > district > locality.

  // Strategy: prefer JSON-LD BreadcrumbList that does NOT contain top-level category names.
  const NAV_NOISE = /^(home|real estate|properties|listings|search|sale|rent|costa rica|jobs|services|cars|vehicles|jobs & services|for sale|community|all)$/i;

  const filterNav = (items: string[]): string[] =>
    items
      .map(s => s.trim())
      .filter(s => s && s.length < 50 && !NAV_NOISE.test(s));

  for (const item of ld) {
    if (item && typeof item === 'object') {
      const t = (item as { '@type'?: unknown })['@type'];
      if (t === 'BreadcrumbList' || (Array.isArray(t) && t.includes('BreadcrumbList'))) {
        const list = (item as { itemListElement?: unknown[] }).itemListElement;
        if (Array.isArray(list)) {
          const names = list.map(li => {
            if (typeof li === 'string') return li;
            const liObj = li as { name?: unknown; item?: { name?: unknown } };
            const name = liObj?.name ?? liObj?.item?.name;
            return typeof name === 'string' ? name : '';
          });
          const cleaned = filterNav(names);
          if (cleaned.length >= 2) return cleaned;
        }
      }
    }
  }

  // Fallback: only look INSIDE the listing detail container (not the site header)
  const out: string[] = [];
  $('[id*="ad-view" i] [class*="breadcrumb" i] a, [class*="ad-detail" i] [class*="breadcrumb" i] a, [class*="listing-detail" i] [class*="breadcrumb" i] a').each((_i, el) => {
    const txt = $(el).text().trim().replace(/\s+/g, ' ');
    if (txt && !out.includes(txt)) out.push(txt);
  });
  return filterNav(out);
}

function extractAgentInfo($: cheerio.CheerioAPI): Record<string, unknown> {
  const text = $('body').text();
  const phoneMatch = text.match(/(?:\+?506[-\s]?)?\d{4}[-\s]?\d{4}/);
  const emailMatch = text.match(/[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const sellerName =
    $('[class*="agent" i], [class*="seller" i], [class*="contact" i]').first().text().trim().slice(0, 80) ||
    null;
  return {
    name: sellerName,
    phone: phoneMatch?.[0] ?? null,
    email: emailMatch?.[0] ?? null,
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
