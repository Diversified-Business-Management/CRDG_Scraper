import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { RawListingPayload } from '@crdg/core';
import cbcr, { parseListingHtml } from '../src/coldwell-banker-cr.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fix = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');

describe('coldwell-banker-cr adapter', () => {
  it('exports a SourceAdapter with the expected slug', () => {
    expect(cbcr.slug).toBe('coldwell-banker-cr');
    expect(cbcr.name).toMatch(/Coldwell Banker/);
  });

  it('parses listing-1 detail HTML into a valid RawListingPayload', () => {
    const html = fix('coldwell-banker-cr-listing-1.html');
    const url = 'https://www.coldwellbankercostarica.com/property/1-bed-commercial-for-sale-in-santa-ana/14598';
    const payload = parseListingHtml(html, url);
    const parsed = RawListingPayload.parse(payload);
    expect(parsed.source_url).toBe(url);
    expect(parsed.source_listing_id).toBe('14598');
    expect(parsed.photos.length).toBeGreaterThan(0);
    const title = String((parsed.raw_extracted ?? {}).title ?? '');
    expect(title.length).toBeGreaterThan(0);
  });

  it('parses listing-2 detail HTML into a valid RawListingPayload', () => {
    const html = fix('coldwell-banker-cr-listing-2.html');
    const url = 'https://www.coldwellbankercostarica.com/property/land-for-sale-in-playa-san-miguel/14594';
    const payload = parseListingHtml(html, url);
    const parsed = RawListingPayload.parse(payload);
    expect(parsed.source_listing_id).toBe('14594');
    expect(parsed.photos.length).toBeGreaterThan(0);
  });
});
