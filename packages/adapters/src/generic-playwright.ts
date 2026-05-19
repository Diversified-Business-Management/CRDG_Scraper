/**
 * Playwright-rendering adapter for JS-heavy real-estate sites.
 *
 * Same shape as generic-real-estate.ts but uses renderPage() for the
 * enumerate phase (where listing URLs are loaded by JS) AND fetchListing
 * (where detail-page content depends on hydration).
 *
 * Targets: Sotheby's International CR, dominical-realty (AJAX listing
 * search), two-cr-real-estate (Salesforce/Propertybase JS-loaded).
 *
 * Config from source_configs.metadata:
 *   {
 *     "start_urls": ["https://example.com/listings"],
 *     "listing_url_regex": "/property/[\\w-]+",
 *     "wait_for_selector": ".listing-card",   // optional, anchors render-wait
 *     "max_pages": 5
 *   }
 */
import * as cheerio from 'cheerio';
import type { EnumerateOpts, RawListingPayload, RawPhoto, SourceAdapter } from '@crdg/core';
import { pgQuery } from '@crdg/core';
import { renderPage } from './util/playwright.js';
import {
  absolutizeUrl,
  dedupePhotos,
  extractJsonLd,
  extractOpenGraph,
  findJsonLdByType,
} from './util/extract.js';

interface PwConfig {
  start_urls: string[];
  listing_url_regex?: string;
  wait_for_selector?: string;
  pagination_param?: string;
  max_pages?: number;
}

async function loadConfig(slug: string): Promise<PwConfig> {
  const rows = await pgQuery<{ metadata: PwConfig | null; base_url: string }>(`
    select sc.metadata, s.base_url
      from source_configs sc
      join sources s on s.id = sc.source_id
     where s.slug = $1
  `, [slug]);
  const row = rows[0];
  const md = (row?.metadata ?? {}) as PwConfig;
  return {
    start_urls: md.start_urls ?? (row?.base_url ? [row.base_url] : []),
    listing_url_regex: md.listing_url_regex,
    wait_for_selector: md.wait_for_selector,
    pagination_param: md.pagination_param ?? 'page',
    max_pages: md.max_pages ?? 10,
  };
}

function makeAdapter(slug: string, name: string): SourceAdapter {
  async function* enumerateListingUrls(opts: EnumerateOpts): AsyncIterable<string> {
    const cfg = await loadConfig(slug);
    if (cfg.start_urls.length === 0) return;
    const re = cfg.listing_url_regex
      ? new RegExp(cfg.listing_url_regex, 'i')
      : /\/(property|properties|listing|listings|sales\/detail)\/[\w-]+\/?$/i;
    const max = opts.maxListings ?? Number.POSITIVE_INFINITY;
    const seen = new Set<string>();
    let yielded = 0;

    for (const startUrl of cfg.start_urls) {
      for (let page = 1; page <= (cfg.max_pages ?? 10); page++) {
        if (opts.signal?.aborted) return;
        if (yielded >= max) return;
        const url = page === 1
          ? startUrl
          : `${startUrl}${startUrl.includes('?') ? '&' : '?'}${cfg.pagination_param}=${page}`;
        let html: string;
        try {
          const res = await renderPage(url, {
            waitForSelector: cfg.wait_for_selector,
            waitForNetworkIdle: true,
            timeoutMs: 45_000,
            signal: opts.signal,
          });
          if (res.status >= 400 && res.status !== 0) break;
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
        if (newOnPage === 0) break; // pagination exhausted
      }
    }
  }

  async function fetchListing(url: string): Promise<RawListingPayload> {
    const { html, finalUrl, status } = await renderPage(url, {
      waitForNetworkIdle: true,
      timeoutMs: 45_000,
    });
    void status;
    return parseDetail(html, finalUrl);
  }

  return { slug, name, enumerateListingUrls, fetchListing };
}

function parseDetail(html: string, sourceUrl: string): RawListingPayload {
  const $ = cheerio.load(html);
  const ld = extractJsonLd(html);
  const og = extractOpenGraph(html);
  const main = findJsonLdByType(ld, [
    'Product', 'RealEstateListing', 'Place', 'Residence', 'SingleFamilyResidence',
    'House', 'Apartment', 'Accommodation',
  ]) ?? ld[0];

  // Photos
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
    if (abs && /\.(jpe?g|png|webp|avif)/i.test(abs)) photoUrls.add(abs);
  });
  if (og['og:image']) {
    const abs = absolutizeUrl(og['og:image'], sourceUrl);
    if (abs) photoUrls.add(abs);
  }
  const photos: RawPhoto[] = dedupePhotos([...photoUrls])
    .filter((u): u is string => !!u)
    .map((url, position) => ({ url, position }));

  const breadcrumbs = extractBreadcrumbs($, ld);

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
  const NAV_NOISE = /^(home|real estate|properties|listings|search|sale|rent|costa rica|for sale|sales|all|cri)$/i;
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

export const sothebysCrPw: SourceAdapter = makeAdapter('sothebys-cr', 'Sothebys International Realty Costa Rica (Playwright)');
export const dominicalRealtyPw: SourceAdapter = makeAdapter('dominical-realty', 'Dominical Realty (Playwright)');
export const twoCrRealEstatePw: SourceAdapter = makeAdapter('two-cr-real-estate', '2 Costa Rica Real Estate (Playwright)');
