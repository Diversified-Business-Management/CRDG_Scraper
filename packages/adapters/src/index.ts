/**
 * @crdg/adapters — registry of all source adapters.
 */

import type { SourceAdapter } from '@crdg/core';

import encuentra24 from './encuentra24.js';
import point2homesCr from './point2homes-cr.js';
import mlscr from './mlscr.js';
import coldwellBankerCr from './coldwell-banker-cr.js';
import developersGeneric from './developers-generic.js';

export const ALL_ADAPTERS: SourceAdapter[] = [
  encuentra24,
  point2homesCr,
  mlscr,
  coldwellBankerCr,
  developersGeneric,
];

const BY_SLUG: Map<string, SourceAdapter> = new Map(ALL_ADAPTERS.map((a) => [a.slug, a]));

export function getAdapter(slug: string): SourceAdapter | undefined {
  return BY_SLUG.get(slug);
}

export { encuentra24, point2homesCr, mlscr, coldwellBankerCr, developersGeneric };

// Re-export utilities consumers may want to compose with.
export { fetchHtml, USER_AGENT } from './util/http.js';
export { renderPage, closeBrowser } from './util/playwright.js';
export {
  extractJsonLd,
  extractOpenGraph,
  absolutizeUrl,
  dedupePhotos,
  findJsonLdByType,
} from './util/extract.js';

// Allow worker to set developer URLs from source_configs.metadata.developer_urls.
export { setDeveloperUrls, DEFAULT_DEVELOPER_URLS } from './developers-generic.js';
