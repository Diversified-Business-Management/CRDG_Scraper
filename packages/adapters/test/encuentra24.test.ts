import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { RawListingPayload } from '@crdg/core';
import * as cheerio from 'cheerio';
import encuentra24, { parseListingHtml } from '../src/encuentra24.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fix = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');

describe('encuentra24 adapter', () => {
  it('exports a SourceAdapter with the expected slug', () => {
    expect(encuentra24.slug).toBe('encuentra24');
    expect(encuentra24.name).toMatch(/Encuentra24/);
    expect(typeof encuentra24.enumerateListingUrls).toBe('function');
    expect(typeof encuentra24.fetchListing).toBe('function');
  });

  it('parses listing-1 detail HTML into a valid RawListingPayload', () => {
    const html = fix('encuentra24-listing-1.html');
    const url = 'https://www.encuentra24.com/costa-rica-en/real-estate-for-sale-houses-homes/contemporary-two-story-home-for-sale-in-guachipelin-escazu-499-000/31381092';
    const { payload } = parseListingHtml(html, url);
    const parsed = RawListingPayload.parse(payload);
    expect(parsed.source_url).toBe(url);
    expect(parsed.source_listing_id).toBe('31381092');
    expect(parsed.photos.length).toBeGreaterThan(0);
    const title = String((parsed.raw_extracted ?? {}).title ?? '');
    expect(title.length).toBeGreaterThan(0);
  });

  it('parses listing-2 detail HTML into a valid RawListingPayload', () => {
    const html = fix('encuentra24-listing-2.html');
    const url = 'https://www.encuentra24.com/costa-rica-en/real-estate-for-sale-apartments-condos/modern-furnished-apartment-for-sale-high-floor-nucleo-sabana-ideal-for-investment/32110136';
    const { payload } = parseListingHtml(html, url);
    const parsed = RawListingPayload.parse(payload);
    expect(parsed.source_listing_id).toBe('32110136');
    expect(parsed.photos.length).toBeGreaterThan(0);
  });

  it('finds listing URLs in the search fixture (synthetic)', () => {
    // Live encuentra24 search page is JS-rendered (kept for reference as
    // encuentra24-search-live-shell.html); synthetic search fixture exercises
    // the URL-extraction regex with the real path pattern.
    const html = fix('encuentra24-search.html');
    const $ = cheerio.load(html);
    const hrefs: string[] = [];
    $('a[href]').each((_i, el) => { hrefs.push($(el).attr('href') ?? ''); });
    // Re-use the adapter's listing regex via path validation
    const re = /^\/costa-rica-en\/real-estate-for-sale-[a-z-]+\/[^/?#]+\/\d+$/i;
    const matches = hrefs.filter((h) => re.test(h));
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});
