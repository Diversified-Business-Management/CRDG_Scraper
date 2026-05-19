import slugify from 'slugify';
import {
  type ExtractedListing,
  type NormalizedListing,
  type RegionSlug,
  toUsd,
  logger,
} from '@crdg/core';
import { computeDistances } from './distance.js';
import { geocodeCRAddress } from './geocode.js';
import { cleanTitle, cleanDescription } from './sanitize.js';

/**
 * Curated locality → CRDG region map. Lowercase, accent-stripped keys.
 * Covers ~30 well-known Costa Rican towns + cantons.
 */
const LOCALITY_TO_REGION: Record<string, RegionSlug> = {
  // Guanacaste (NW Pacific, north of Nicoya peninsula)
  tamarindo: 'guanacaste',
  'playa grande': 'guanacaste',
  flamingo: 'guanacaste',
  'playa flamingo': 'guanacaste',
  potrero: 'guanacaste',
  conchal: 'guanacaste',
  brasilito: 'guanacaste',
  'playa hermosa': 'guanacaste', // (the northern one — there are two)
  'playas del coco': 'guanacaste',
  coco: 'guanacaste',
  ocotal: 'guanacaste',
  papagayo: 'guanacaste',
  liberia: 'guanacaste',

  // Nicoya (south Nicoya peninsula — Puntarenas province)
  nosara: 'nicoya',
  'playa guiones': 'nicoya',
  samara: 'nicoya',
  'santa teresa': 'nicoya',
  malpais: 'nicoya',
  'mal pais': 'nicoya',
  montezuma: 'nicoya',
  'playa carmen': 'nicoya',
  hermosa: 'nicoya', // ambiguous — south hermosa near Jaco actually central pacific

  // Central Pacific (Jaco, Manuel Antonio, Quepos)
  jaco: 'central-pacific',
  'playa jaco': 'central-pacific',
  'manuel antonio': 'central-pacific',
  quepos: 'central-pacific',
  herradura: 'central-pacific',
  esterillos: 'central-pacific',

  // South Pacific (Dominical -> Ojochal)
  dominical: 'south-pacific',
  uvita: 'south-pacific',
  ojochal: 'south-pacific',
  'playa hermosa de osa': 'south-pacific',
  'puerto jimenez': 'south-pacific',
  'drake bay': 'south-pacific',
  'bahia ballena': 'south-pacific',

  // Caribbean
  'puerto viejo': 'caribbean',
  cahuita: 'caribbean',
  manzanillo: 'caribbean',
  limon: 'caribbean',
  'puerto limon': 'caribbean',

  // Central Valley
  atenas: 'central-valley',
  escazu: 'central-valley',
  'santa ana': 'central-valley',
  heredia: 'central-valley',
  grecia: 'central-valley',
  sarchi: 'central-valley',
  alajuela: 'central-valley',
  'san jose': 'central-valley',
  cartago: 'central-valley',
  naranjo: 'central-valley',
  palmares: 'central-valley',
  orotina: 'central-valley',
};

/**
 * Rough lat/lng bounding boxes for the 6 CRDG regions. These are intentionally
 * coarse — they exist as a fallback when we have coordinates but no locality
 * match. Order matters: more specific (smaller) boxes are checked first.
 */
const REGION_BOXES: Array<{ region: RegionSlug; minLat: number; maxLat: number; minLng: number; maxLng: number }> = [
  // Caribbean: east coast strip
  { region: 'caribbean', minLat: 9.4, maxLat: 11.0, minLng: -83.7, maxLng: -82.5 },
  // South Pacific: Dominical south through Osa peninsula
  { region: 'south-pacific', minLat: 8.3, maxLat: 9.4, minLng: -84.0, maxLng: -82.7 },
  // Central Pacific: Jaco -> Manuel Antonio -> Quepos (eastern Pacific coast)
  { region: 'central-pacific', minLat: 9.3, maxLat: 9.85, minLng: -84.85, maxLng: -84.0 },
  // Guanacaste: NW Pacific incl. Tamarindo + Liberia. Higher latitude / west coast.
  { region: 'guanacaste', minLat: 10.15, maxLat: 11.2, minLng: -86.0, maxLng: -85.0 },
  // Nicoya peninsula southern half (Nosara, Samara, Santa Teresa, Montezuma)
  { region: 'nicoya', minLat: 9.55, maxLat: 10.15, minLng: -85.85, maxLng: -84.95 },
  // Central Valley: catch-all interior
  { region: 'central-valley', minLat: 9.7, maxLat: 10.3, minLng: -84.5, maxLng: -83.7 },
];

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function lookupRegionByLocality(...candidates: Array<string | null | undefined>): RegionSlug | null {
  for (const c of candidates) {
    if (!c) continue;
    const key = stripAccents(c);
    const direct = LOCALITY_TO_REGION[key];
    if (direct) return direct;
    // Try contains match — sometimes the locality is "Nosara, Guanacaste"
    for (const [needle, region] of Object.entries(LOCALITY_TO_REGION)) {
      if (key.includes(needle)) return region;
    }
  }
  return null;
}

export function lookupRegionByCoords(lat: number | null | undefined, lng: number | null | undefined): RegionSlug | null {
  if (lat == null || lng == null) return null;
  for (const box of REGION_BOXES) {
    if (lat >= box.minLat && lat <= box.maxLat && lng >= box.minLng && lng <= box.maxLng) {
      return box.region;
    }
  }
  return null;
}

function shortId(): string {
  // 6-char base36 timestamp suffix; deterministic-ish, ok for slug uniqueness
  return Math.random().toString(36).slice(2, 8);
}

export function buildSlug(parts: { title?: string | null; locality?: string | null }): string {
  const base = parts.title || parts.locality || 'untitled';
  const slug = slugify(base, { lower: true, strict: true, locale: 'es' });
  const trimmed = slug.length > 60 ? slug.slice(0, 60).replace(/-+$/, '') : slug;
  return `${trimmed || 'untitled'}-${shortId()}`;
}

export interface NormalizeOpts {
  /** Override for slug suffix (test determinism). */
  slugSuffix?: string;
}

/**
 * Stage 2: deterministic post-processing of an ExtractedListing into
 * a NormalizedListing. No AI. Pure (modulo FX rate fetch).
 */
export async function normalize(
  extracted: ExtractedListing,
  opts: NormalizeOpts = {},
): Promise<NormalizedListing> {
  // Currency conversion
  let priceUsd: number | null = null;
  if (extracted.price != null && extracted.price_currency) {
    try {
      priceUsd = await toUsd(extracted.price, extracted.price_currency);
      priceUsd = Math.round(priceUsd * 100) / 100;
    } catch (e) {
      logger.warn({ err: (e as Error).message }, 'normalize.fx_failed');
    }
  } else if (extracted.price != null && !extracted.price_currency) {
    // Assume USD when unspecified; CR market typically lists USD anyway.
    priceUsd = Math.round(extracted.price * 100) / 100;
  }

  // price_per_sqm derived
  let pricePerSqm: number | null = null;
  if (priceUsd != null && extracted.interior_sqm && extracted.interior_sqm > 0) {
    pricePerSqm = Math.round((priceUsd / extracted.interior_sqm) * 100) / 100;
  }

  // Region: locality first, then coordinates
  const region =
    lookupRegionByLocality(extracted.locality, extracted.canton, extracted.district, extracted.province) ??
    lookupRegionByCoords(extracted.lat, extracted.lng);

  // If the listing didn't include lat/lng but did include locality/canton/
  // province, geocode via Mapbox to get coordinates + a confidence rating.
  let lat = extracted.lat ?? null;
  let lng = extracted.lng ?? null;
  let geocodeConfidence: NormalizedListing['geocode_confidence'] =
    lat != null && lng != null ? 'exact' : null;
  if (lat == null || lng == null) {
    const g = await geocodeCRAddress({
      address_line: extracted.address_line,
      locality: extracted.locality,
      district: extracted.district,
      canton: extracted.canton,
      province: extracted.province,
    });
    if (g) {
      lat = g.lat;
      lng = g.lng;
      geocodeConfidence = g.confidence;
    }
  }

  // Slug
  const slugBase = opts.slugSuffix
    ? `${slugify(extracted.title || extracted.locality || 'untitled', { lower: true, strict: true, locale: 'es' })}-${opts.slugSuffix}`
    : buildSlug({ title: extracted.title, locality: extracted.locality });

  // Currency normalization for HOA, taxes, original list price
  const hoaUsd = await maybeToUsd(extracted.hoa_fee, extracted.price_currency);
  const taxesUsd = await maybeToUsd(extracted.taxes_annual, extracted.price_currency);
  const originalListUsd = await maybeToUsd(extracted.list_price_original, extracted.price_currency);

  // Distances — only meaningful when we have coordinates (extracted or geocoded) inside CR.
  const distances = await computeDistances(
    lat != null && lng != null ? { lat, lng } : null,
  );

  // Sanitize title + description — decode HTML entities, strip brand noise.
  const cleanedTitle = cleanTitle(extracted.title);
  const cleanedDesc = cleanDescription(extracted.description);

  return {
    ...extracted,
    title: cleanedTitle,
    description: cleanedDesc,
    lat,
    lng,
    price_usd: priceUsd,
    price_per_sqm: pricePerSqm,
    hoa_fee_usd: hoaUsd,
    taxes_usd_annual: taxesUsd,
    list_price_original_usd: originalListUsd,
    region_slug: region,
    geocode_confidence: geocodeConfidence,
    slug: slugBase,
    ...distances,
  };
}

async function maybeToUsd(amount: number | null | undefined, currency: ExtractedListing['price_currency']): Promise<number | null> {
  if (amount == null) return null;
  try {
    if (currency === 'USD' || currency == null) return Math.round(amount * 100) / 100;
    const v = await toUsd(amount, currency);
    return Math.round(v * 100) / 100;
  } catch {
    return null;
  }
}
