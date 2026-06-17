/**
 * Generic real-estate site adapter.
 *
 * Most CR partner sites run WordPress + Houzez (or a similar theme) and follow
 * one of a few common URL patterns: /property/{slug}, /properties/{slug},
 * /listing/{id}, /real-estate/{slug}. This adapter handles all of them by:
 *
 * - Reading start URLs + listing-URL regex from `source_configs.metadata`
 * - Fetching the start page(s), pulling listing URLs that match the regex,
 *   following pagination via common ?page=N / ?paged=N / ?p=N params
 * - Parsing each detail page through the shared JSON-LD / OG / breadcrumbs
 *   pipeline (same as the encuentra24 adapter)
 *
 * To add a site, insert a row into `sources` and set `source_configs.metadata`
 * to e.g.:
 *   {
 *     "start_urls": ["https://example.com/properties/"],
 *     "listing_url_regex": "^https?://example\\.com/property/[\\w-]+/?$",
 *     "pagination_param": "page"
 *   }
 *
 * Defaults assume Houzez conventions if metadata is empty.
 */
import * as cheerio from 'cheerio';
import type { EnumerateOpts, RawListingPayload, RawPhoto, SourceAdapter } from '@crdg/core';
import { pgQuery } from '@crdg/core';
import { fetchHtml } from './util/http.js';
import {
  absolutizeUrl,
  dedupePhotos,
  extractJsonLd,
  extractOpenGraph,
  findJsonLdByType,
} from './util/extract.js';

interface GenericConfig {
  start_urls: string[];
  /** RegExp source matching detail-page URLs. */
  listing_url_regex?: string;
  /** Query-param name for pagination (default 'page'). */
  pagination_param?: string;
  /** Max pages to crawl per start URL. */
  max_pages?: number;
}

const DEFAULT_LISTING_RE = /\/(property|properties|listing|listings|real-estate|home|homes)\/[\w-]+\/?$/i;

async function loadConfigForSlug(slug: string): Promise<GenericConfig> {
  const rows = await pgQuery<{ metadata: GenericConfig | null; base_url: string }>(`
    select sc.metadata, s.base_url
      from source_configs sc
      join sources s on s.id = sc.source_id
     where s.slug = $1
  `, [slug]);
  const row = rows[0];
  if (!row) return { start_urls: [] };
  const md = row.metadata ?? {} as GenericConfig;
  return {
    start_urls: md.start_urls ?? (row.base_url ? [row.base_url] : []),
    listing_url_regex: md.listing_url_regex,
    pagination_param: md.pagination_param ?? 'page',
    max_pages: md.max_pages ?? 30,
  };
}

function makeAdapter(slug: string, name: string): SourceAdapter {
  async function* enumerateListingUrls(opts: EnumerateOpts): AsyncIterable<string> {
    const cfg = await loadConfigForSlug(slug);
    if (cfg.start_urls.length === 0) return;
    const re = cfg.listing_url_regex ? new RegExp(cfg.listing_url_regex, 'i') : DEFAULT_LISTING_RE;
    const max = opts.maxListings ?? Number.POSITIVE_INFINITY;
    const seen = new Set<string>();
    let yielded = 0;

    for (const startUrl of cfg.start_urls) {
      let emptyStreak = 0;
      for (let page = 1; page <= (cfg.max_pages ?? 30) && emptyStreak < 2; page++) {
        if (opts.signal?.aborted) return;
        if (yielded >= max) return;
        const url = page === 1
          ? startUrl
          : `${startUrl}${startUrl.includes('?') ? '&' : '?'}${cfg.pagination_param}=${page}`;
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
          const abs = absolutizeUrl(href, startUrl);
          if (!abs) return;
          if (!re.test(abs)) return;
          if (seen.has(abs)) return;
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
  }

  async function fetchListing(url: string): Promise<RawListingPayload> {
    const { html, finalUrl } = await fetchHtml(url);
    return parseDetail(html, finalUrl);
  }

  return { slug, name, enumerateListingUrls, fetchListing };
}

/** Generic detail-page parser. Same shape as encuentra24's. */
function parseDetail(html: string, sourceUrl: string): RawListingPayload {
  const $ = cheerio.load(html);
  const ld = extractJsonLd(html);
  const og = extractOpenGraph(html);

  const main = findJsonLdByType(ld, [
    'Product', 'RealEstateListing', 'Place', 'Residence', 'SingleFamilyResidence',
    'House', 'Apartment', 'Accommodation',
  ]) ?? ld[0];

  // Photos — JSON-LD first, then DOM fallback
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
    const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy') || $(el).attr('data-lazy-src');
    const abs = absolutizeUrl(src ?? '', sourceUrl);
    if (abs && /\.(jpe?g|png|webp|avif)/i.test(abs)) photoUrls.add(abs);
  });
  if (og['og:image']) {
    const abs = absolutizeUrl(og['og:image'], sourceUrl);
    if (abs) photoUrls.add(abs);
  }
  const photos: RawPhoto[] = dedupePhotos([...photoUrls])
    .filter((u): u is string => !!u)
    .map((url, position) => ({ url, position }));

  // Breadcrumbs from JSON-LD or visible nav
  const breadcrumbs = extractBreadcrumbs($, ld);

  // Listing ID — last URL segment
  let id = sourceUrl;
  try {
    const u = new URL(sourceUrl);
    const segs = u.pathname.split('/').filter(Boolean);
    id = segs[segs.length - 1] ?? sourceUrl;
  } catch { /* keep url */ }

  const raw_extracted: Record<string, unknown> = {
    json_ld: ld,
    og,
    title: og['og:title'] || $('h1').first().text().trim() || $('title').text().trim(),
    description: og['og:description'] || $('meta[name="description"]').attr('content') || '',
    breadcrumbs,
    detail_text: $('main, [class*="property" i], [class*="listing" i], article').first().text().trim().slice(0, 5000),
  };

  return {
    source_listing_id: id,
    source_url: sourceUrl,
    raw_html: html,
    raw_extracted,
    breadcrumbs,
    photos,
  };
}

function extractBreadcrumbs($: cheerio.CheerioAPI, ld: unknown[]): string[] {
  const NAV_NOISE = /^(home|real estate|properties|listings|search|sale|rent|costa rica|for sale|sales|all)$/i;
  const filterNav = (items: string[]) =>
    items.map(s => s.trim()).filter(s => s && s.length < 60 && !NAV_NOISE.test(s));

  for (const item of ld) {
    if (item && typeof item === 'object') {
      const t = (item as { '@type'?: unknown })['@type'];
      if (t === 'BreadcrumbList' || (Array.isArray(t) && t.includes('BreadcrumbList'))) {
        const list = (item as { itemListElement?: unknown[] }).itemListElement;
        if (Array.isArray(list)) {
          const names = list.map(li => {
            if (typeof li === 'string') return li;
            const liObj = li as { name?: unknown; item?: { name?: unknown } };
            const n = liObj?.name ?? liObj?.item?.name;
            return typeof n === 'string' ? n : '';
          });
          const cleaned = filterNav(names);
          if (cleaned.length >= 2) return cleaned;
        }
      }
    }
  }
  const out: string[] = [];
  $('[class*="breadcrumb" i] a, nav[aria-label*="breadcrumb" i] li').each((_i, el) => {
    const txt = $(el).text().trim().replace(/\s+/g, ' ');
    if (txt && !out.includes(txt)) out.push(txt);
  });
  return filterNav(out);
}

// Adapter instances for each of the 9 generic sources
export const realtorComCr: SourceAdapter = makeAdapter('realtor-com-cr', 'Realtor.com International — Costa Rica');
export const reCr: SourceAdapter = makeAdapter('re-cr', 'RE/MAX Costa Rica');
export const coldwellCbTamarindo: SourceAdapter = makeAdapter('coldwell-cb-tamarindo', 'Coldwell Banker Tamarindo');
export const propertiesInCr: SourceAdapter = makeAdapter('properties-in-cr', 'Properties in Costa Rica');
export const sothebysCr: SourceAdapter = makeAdapter('sothebys-cr', 'Sothebys International Realty Costa Rica');
export const dominicalRealty: SourceAdapter = makeAdapter('dominical-realty', 'Dominical Realty');
export const twoCrRealEstate: SourceAdapter = makeAdapter('two-cr-real-estate', '2 Costa Rica Real Estate');
export const crDreamMakers: SourceAdapter = makeAdapter('cr-dream-makers', 'Costa Rica Dream Makers');
export const rpmRealEstateCr: SourceAdapter = makeAdapter('rpm-real-estate-cr', 'RPM Real Estate Costa Rica');

export const ALL_GENERIC: SourceAdapter[] = [
  realtorComCr, reCr, coldwellCbTamarindo, propertiesInCr,
  sothebysCr, dominicalRealty, twoCrRealEstate, crDreamMakers, rpmRealEstateCr,
];
