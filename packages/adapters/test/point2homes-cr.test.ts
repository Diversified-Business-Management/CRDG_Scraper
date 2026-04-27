import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { RawListingPayload } from '@crdg/core';
import point2homes, { parseListingHtml } from '../src/point2homes-cr.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fix = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');

// Live point2homes was blocked by Cloudflare (HTTP 403) at fixture-fetch time;
// these fixtures are synthetic but mirror real URL/JSON-LD structure.
describe('point2homes-cr adapter', () => {
  it('exports a SourceAdapter with the expected slug', () => {
    expect(point2homes.slug).toBe('point2homes-cr');
    expect(point2homes.name).toMatch(/Point2Homes/);
  });

  it('parses listing-1 (synthetic) into a valid RawListingPayload', () => {
    const html = fix('point2homes-cr-listing-1.html');
    const url = 'https://www.point2homes.com/CR/Homes-For-Sale/Jaco/Beachfront-Condo/87654321.html';
    const payload = parseListingHtml(html, url);
    const parsed = RawListingPayload.parse(payload);
    expect(parsed.source_url).toBe(url);
    expect(parsed.source_listing_id).toBe('87654321');
    expect(parsed.photos.length).toBeGreaterThan(0);
    const title = String((parsed.raw_extracted ?? {}).title ?? '');
    expect(title).toMatch(/Beachfront Condo/i);
  });

  it('parses listing-2 (synthetic) into a valid RawListingPayload', () => {
    const html = fix('point2homes-cr-listing-2.html');
    const url = 'https://www.point2homes.com/CR/Homes-For-Sale/Atenas/Hilltop-Lot/12345678.html';
    const payload = parseListingHtml(html, url);
    const parsed = RawListingPayload.parse(payload);
    expect(parsed.source_listing_id).toBe('12345678');
    expect(parsed.photos.length).toBeGreaterThan(0);
  });
});
