import { z } from 'zod';

export const RegionSlug = z.enum([
  'central-pacific',
  'guanacaste',
  'central-valley',
  'nicoya',
  'caribbean',
  'south-pacific',
]);
export type RegionSlug = z.infer<typeof RegionSlug>;

export const PropertyType = z.enum([
  'house', 'condo', 'lot', 'farm', 'commercial', 'hotel', 'other',
]);
export type PropertyType = z.infer<typeof PropertyType>;

export const Currency = z.enum(['USD', 'CRC']);
export type Currency = z.infer<typeof Currency>;

export const ListingStatus = z.enum([
  'draft', 'active', 'pending_review', 'sold', 'withdrawn', 'stale',
]);
export type ListingStatus = z.infer<typeof ListingStatus>;

/** Minimal photo descriptor as captured during scrape. */
export const RawPhoto = z.object({
  url: z.string().url(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  position: z.number().int().nonnegative().optional(),
  alt: z.string().optional(),
});
export type RawPhoto = z.infer<typeof RawPhoto>;

/** What a SourceAdapter returns from fetchListing(). */
export const RawListingPayload = z.object({
  source_listing_id: z.string().min(1),
  source_url: z.string().url(),
  raw_html: z.string().optional(),
  raw_extracted: z.record(z.string(), z.unknown()).optional(),
  photos: z.array(RawPhoto).default([]),
});
export type RawListingPayload = z.infer<typeof RawListingPayload>;

/** Output of the AI extract stage. */
export const ExtractedListing = z.object({
  title: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  language: z.enum(['en', 'es', 'mixed', 'unknown']).nullable().optional(),
  property_type: PropertyType.nullable().optional(),
  price: z.number().nullable().optional(),
  price_currency: Currency.nullable().optional(),
  bedrooms: z.number().nullable().optional(),
  bathrooms: z.number().nullable().optional(),
  interior_sqm: z.number().nullable().optional(),
  lot_sqm: z.number().nullable().optional(),
  year_built: z.number().int().nullable().optional(),
  province: z.string().nullable().optional(),
  canton: z.string().nullable().optional(),
  district: z.string().nullable().optional(),
  locality: z.string().nullable().optional(),
  address_line: z.string().nullable().optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  features: z.array(z.string()).default([]),
  hoa_fee_usd: z.number().nullable().optional(),
  taxes_usd_annual: z.number().nullable().optional(),
  mls_id: z.string().nullable().optional(),
  agent_name: z.string().nullable().optional(),
  agent_email: z.string().nullable().optional(),
  agent_phone: z.string().nullable().optional(),
  listed_at: z.string().nullable().optional(), // ISO date
  confidence_per_field: z.record(z.string(), z.number()).default({}),
  notes: z.string().nullable().optional(),
});
export type ExtractedListing = z.infer<typeof ExtractedListing>;

/** Output of normalize stage. */
export const NormalizedListing = ExtractedListing.extend({
  price_usd: z.number().nullable().optional(),
  price_per_sqm: z.number().nullable().optional(),
  region_slug: RegionSlug.nullable().optional(),
  geocode_confidence: z.enum(['exact', 'block', 'neighborhood', 'region']).nullable().optional(),
  slug: z.string(),
});
export type NormalizedListing = z.infer<typeof NormalizedListing>;

/** Final fully-enriched listing. */
export const EnrichedListing = NormalizedListing.extend({
  title_en: z.string().nullable().optional(),
  title_es: z.string().nullable().optional(),
  description_en: z.string().nullable().optional(),
  description_es: z.string().nullable().optional(),
  description_raw: z.string().nullable().optional(),
  tags_ai: z.array(z.string()).default([]),
  hero_photo_index: z.number().int().nonnegative().optional(),
  photos_alt: z.record(z.string(), z.string()).optional(),
});
export type EnrichedListing = z.infer<typeof EnrichedListing>;

/** Source adapter interface. */
export interface EnumerateOpts {
  regions?: RegionSlug[];
  maxListings?: number;
  signal?: AbortSignal;
}

export interface SourceAdapter {
  slug: string;
  name: string;
  enumerateListingUrls(opts: EnumerateOpts): AsyncIterable<string>;
  fetchListing(url: string): Promise<RawListingPayload>;
  authenticate?(): Promise<void>;
}

/** Costa Rica feature vocabulary — keep stable for filtering. */
export const FeatureVocab = [
  'pool', 'ocean_view', 'mountain_view', 'jungle_view', 'beachfront',
  'gated_community', 'titled', 'concession', 'turnkey', 'fixer',
  'income_producing', 'rental_potential', 'new_construction',
  'furnished', 'unfurnished', 'air_conditioning', 'solar', 'backup_generator',
  'hoa', 'private_well', 'city_water',
  'investment_grade', 'retiree_friendly', 'family_friendly',
  'horse_friendly', 'farm', 'agricultural',
  'walkable', 'remote', 'beach_access', 'walk_to_beach',
] as const;
export type Feature = typeof FeatureVocab[number];

export const TagVocab = [
  'luxury', 'budget', 'investment', 'lifestyle', 'fixer_upper',
  'turnkey', 'income_property', 'developer_inventory', 'pre_construction',
  'eco', 'sustainable', 'off_grid',
] as const;
export type Tag = typeof TagVocab[number];
