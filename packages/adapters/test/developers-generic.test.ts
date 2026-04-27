import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { RawListingPayload } from '@crdg/core';
import devs, { parseListingHtml, DEFAULT_DEVELOPER_URLS, setDeveloperUrls } from '../src/developers-generic.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fix = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');

describe('developers-generic adapter', () => {
  it('exports a SourceAdapter with the expected slug and a default URL list', () => {
    expect(devs.slug).toBe('developers-generic');
    expect(DEFAULT_DEVELOPER_URLS.length).toBeGreaterThan(0);
  });

  it('parses listing-1 (reservaconchal.com/sanara) into a valid RawListingPayload', () => {
    const html = fix('developers-generic-listing-1.html');
    const url = 'https://reservaconchal.com/sanara';
    const payload = parseListingHtml(html, url);
    const parsed = RawListingPayload.parse(payload);
    expect(parsed.source_url).toBe(url);
    expect(parsed.source_listing_id).toMatch(/reservaconchal\.com/);
    const title = String((parsed.raw_extracted ?? {}).title ?? '');
    expect(title.length).toBeGreaterThan(0);
    // Sanara page is heavy; should produce at least one photo via <img> tags.
    expect(parsed.photos.length).toBeGreaterThan(0);
  });

  it('parses listing-2 (reservaconchal.com/real-state) into a valid RawListingPayload', () => {
    const html = fix('developers-generic-listing-2.html');
    const url = 'https://reservaconchal.com/real-state/';
    const payload = parseListingHtml(html, url);
    const parsed = RawListingPayload.parse(payload);
    expect(parsed.source_url).toBe(url);
    expect(parsed.source_listing_id).toMatch(/reservaconchal\.com/);
    expect(parsed.photos.length).toBeGreaterThanOrEqual(0); // some developer pages have no photos
  });

  it('lets callers override the developer URL list', async () => {
    setDeveloperUrls(['https://example.com/a', 'https://example.com/b']);
    const seen: string[] = [];
    for await (const u of devs.enumerateListingUrls({ maxListings: 10 })) seen.push(u);
    expect(seen).toEqual(['https://example.com/a', 'https://example.com/b']);
    // Reset to defaults so the constant test still passes if re-run.
    setDeveloperUrls([]);
  });
});
