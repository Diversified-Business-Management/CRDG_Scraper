// Re-export selected types from @crdg/core
export type {
  RegionSlug,
  PropertyType,
  ListingStatus,
  Currency,
  Feature,
  Tag,
} from '@crdg/core/types';

export { FeatureVocab, TagVocab } from '@crdg/core/types';

/**
 * Matches the shape of `v_listings_card` view defined in
 * `supabase/migrations/20260427000001_initial_schema.sql`.
 */
export interface ListingCardRow {
  id: string;
  slug: string;
  status: string;
  title_en: string | null;
  title_es: string | null;
  property_type: string | null;
  price_usd: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  interior_sqm: number | null;
  lot_sqm: number | null;
  region_slug: string | null;
  locality: string | null;
  canton: string | null;
  lat: number | null;
  lng: number | null;
  tags_ai: string[] | null;
  tags_human: string[] | null;
  features: string[] | null;
  hero_url: string | null;
  fallback_url: string | null;
  last_seen_at: string | null;
  wp_post_id: number | null;
}

export interface CanonicalListingRow {
  id: string;
  slug: string;
  status: string;
  listing_type: string;
  property_type: string | null;
  title_en: string | null;
  title_es: string | null;
  description_en: string | null;
  description_es: string | null;
  description_raw: string | null;
  price: number | null;
  price_currency: string | null;
  price_usd: number | null;
  price_per_sqm: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  interior_sqm: number | null;
  lot_sqm: number | null;
  year_built: number | null;
  region_slug: string | null;
  province: string | null;
  canton: string | null;
  district: string | null;
  locality: string | null;
  address_line: string | null;
  lat: number | null;
  lng: number | null;
  geocode_confidence: string | null;
  features: string[] | null;
  tags_ai: string[] | null;
  tags_human: string[] | null;
  hoa_fee_usd: number | null;
  taxes_usd_annual: number | null;
  mls_id: string | null;
  agent_id: string | null;
  listed_at: string | null;
  last_seen_at: string | null;
  confidence: number | null;
  wp_post_id: number | null;
  wp_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PhotoRow {
  id: string;
  canonical_listing_id: string;
  url_source: string;
  url_supabase: string | null;
  position: number | null;
  is_hero: boolean;
  alt_text_en: string | null;
  alt_text_es: string | null;
  width: number | null;
  height: number | null;
}

export interface SourceRow {
  id: string;
  slug: string;
  name: string;
  base_url: string;
  enabled: boolean;
  notes: string | null;
}

export interface SourceConfigRow {
  id: string;
  source_id: string;
  cron_expression: string;
  rate_limit_rps: number;
  burst: number;
  max_listings_per_run: number;
  regions: string[] | null;
  enabled: boolean;
  last_run_at: string | null;
}

export interface RecentRunRow {
  id: string;
  source_id: string;
  source_slug: string;
  source_name: string;
  trigger: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  listings_seen: number | null;
  listings_new: number | null;
  listings_updated: number | null;
  listings_failed: number | null;
  cost_usd: number | null;
  error: string | null;
  duration_seconds: number | null;
}

export interface RunLogRow {
  id: number;
  run_id: string;
  stage: string;
  level: string;
  message: string;
  data: Record<string, unknown> | null;
  created_at: string;
}

export interface AiCostDailyRow {
  day: string;
  cost_usd: number;
  haiku_input_tokens: number;
  haiku_output_tokens: number;
  sonnet_input_tokens: number;
  sonnet_output_tokens: number;
  embedding_tokens: number;
  call_count: number;
}

export interface PipelineFunnelRow {
  source_slug: string;
  source_name: string;
  extracted: number;
  normalized: number;
  deduped: number;
  enriched: number;
  published: number;
  failed: number;
  total: number;
}

export interface DedupLinkRow {
  id: string;
  canonical_listing_id: string;
  raw_listing_id: string;
  confidence: number;
  method: string;
  reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface AlertRow {
  id: string;
  severity: string;
  source: string;
  message: string;
  data: Record<string, unknown> | null;
  acknowledged_at: string | null;
  created_at: string;
}

export interface AgentRow {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  enabled: boolean;
}

export type UserRole = 'admin' | 'realtor';

export interface SessionUser {
  id: string;
  email: string;
  role: UserRole;
}
