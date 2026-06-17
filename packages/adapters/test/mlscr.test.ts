import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { RawListingPayload } from '@crdg/core';
import mlscr, { parseListingHtml } from '../src/mlscr.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fix = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');

describe('mlscr adapter', () => {
  it('exports a SourceAdapter with the expected slug', () => {
    expect(mlscr.slug).toBe('mlscr');
    expect(mlscr.name).toMatch(/MLS/);
  });

  it('parses listing-1 detail HTML into a valid RawListingPayload', () => {
    const html = fix('mlscr-listing-1.html');
    const url = 'https://mls.cr/properties/orange-house/';
    const payload = parseListingHtml(html, url);
    const parsed = RawListingPayload.parse(payload);
    expect(parsed.source_url).toBe(url);
    expect(parsed.source_listing_id).toBe('orange-house');
    expect(parsed.photos.length).toBeGreaterThan(0);
    const title = String((parsed.raw_extracted ?? {}).title ?? '');
    expect(title.length).toBeGreaterThan(0);
  });

  it('parses listing-2 detail HTML into a valid RawListingPayload', () => {
    const html = fix('mlscr-listing-2.html');
    const url = 'https://mls.cr/properties/spectacular-ocean-view-farm/';
    const payload = parseListingHtml(html, url);
    const parsed = RawListingPayload.parse(payload);
    expect(parsed.source_listing_id).toBe('spectacular-ocean-view-farm');
    expect(parsed.photos.length).toBeGreaterThan(0);
  });
});
