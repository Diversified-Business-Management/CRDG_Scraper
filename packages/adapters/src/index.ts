/**
 * @crdg/adapters — registry of all source adapters.
 */

import type { SourceAdapter } from '@crdg/core';

import encuentra24 from './encuentra24.js';
import point2homesCr from './point2homes-cr.js';
import mlscr from './mlscr.js';
import coldwellBankerCr from './coldwell-banker-cr.js';
import developersGeneric from './developers-generic.js';
import {
  ALL_GENERIC,
  realtorComCr,
  reCr,
  coldwellCbTamarindo,
  propertiesInCr,
  crDreamMakers,
  rpmRealEstateCr,
} from './generic-real-estate.js';
import {
  sothebysCrPw,
  dominicalRealtyPw,
  twoCrRealEstatePw,
} from './generic-playwright.js';

// Slugs that have a Playwright variant — these OVERRIDE the static-HTML
// generic adapter so the registry resolves to the JS-rendering one.
const PW_OVERRIDES: SourceAdapter[] = [sothebysCrPw, dominicalRealtyPw, twoCrRealEstatePw];
const PW_SLUGS = new Set(PW_OVERRIDES.map(a => a.slug));

export const ALL_ADAPTERS: SourceAdapter[] = [
  encuentra24,
  point2homesCr,
  mlscr,
  coldwellBankerCr,
  developersGeneric,
  ...ALL_GENERIC.filter(a => !PW_SLUGS.has(a.slug)),
  ...PW_OVERRIDES,
];

const BY_SLUG: Map<string, SourceAdapter> = new Map(ALL_ADAPTERS.map((a) => [a.slug, a]));

export function getAdapter(slug: string): SourceAdapter | undefined {
  return BY_SLUG.get(slug);
}

export {
  encuentra24, point2homesCr, mlscr, coldwellBankerCr, developersGeneric,
  realtorComCr, reCr, coldwellCbTamarindo, propertiesInCr,
  crDreamMakers, rpmRealEstateCr,
};
export { sothebysCrPw, dominicalRealtyPw, twoCrRealEstatePw };

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
