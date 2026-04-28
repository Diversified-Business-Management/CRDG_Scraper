import { getPgPool, logger, type EnrichedListing, type RawPhoto } from '@crdg/core';
import type { DedupeResult } from './dedupe.js';

export interface PublishResult {
  canonical_listing_id: string;
  action: 'merge' | 'create' | 'review';
  photos_inserted: number;
}

/**
 * Stage 5: write the EnrichedListing to canonical_listings, link the raw row,
 * insert photos. Wrapped in a single transaction.
 *
 * Writes the full 95-field canonical schema. Currency-converted numeric fields
 * are read from the NormalizedListing's *_usd variants; everything else passes
 * through as-is.
 */
export async function publish(
  rawListingId: string,
  enriched: EnrichedListing & {
    primary_source_url?: string | null;
  },
  dedupeResult: DedupeResult,
  photos: RawPhoto[],
): Promise<PublishResult> {
  const pool = getPgPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Build the column list + values used by both create and merge.
    const cols = buildCanonicalRow(enriched, dedupeResult);

    let canonicalId: string;
    let action: 'merge' | 'create' | 'review';
    let photosInserted = 0;

    if (dedupeResult.action === 'merge' && dedupeResult.canonical_listing_id) {
      canonicalId = dedupeResult.canonical_listing_id;
      action = 'merge';
      // For merge: only update non-null new values + fields that should overwrite.
      const setSql = cols.merge.setColumns
        .map((c, i) => `${c} = coalesce($${i + 2}, ${c})`)
        .join(', ');
      await client.query(
        `update canonical_listings set ${setSql}, last_seen_at = now(), updated_at = now() where id = $1`,
        [canonicalId, ...cols.merge.values],
      );
    } else {
      action = dedupeResult.action === 'review' ? 'review' : 'create';
      const status = action === 'review' ? 'pending_review' : 'active';
      const placeholders = cols.insert.columns.map((_, i) => `$${i + 1}`).join(',');
      const inserted = await client.query<{ id: string }>(
        `insert into canonical_listings (${cols.insert.columns.join(',')}, status, listing_type)
         values (${placeholders}, $${cols.insert.columns.length + 1}, 'sale') returning id`,
        [...cols.insert.values, status],
      );
      canonicalId = inserted.rows[0]!.id;

      // Embedding row
      if (dedupeResult.embedding && dedupeResult.embedding.length > 0) {
        const literal = `[${dedupeResult.embedding.join(',')}]`;
        await client.query(
          `insert into listing_embeddings (canonical_listing_id, embedding, model, text_hash)
           values ($1, $2::vector, $3, $4)
           on conflict (canonical_listing_id, model) do update
             set embedding = excluded.embedding, text_hash = excluded.text_hash`,
          [canonicalId, literal, process.env['VOYAGE_API_KEY'] ? 'voyage-2' : 'hash-dev', dedupeResult.text_hash],
        );
      }
    }

    // Always insert dedup_links
    await client.query(
      `insert into dedup_links (canonical_listing_id, raw_listing_id, confidence, method)
       values ($1, $2, $3, $4)
       on conflict (canonical_listing_id, raw_listing_id) do update
         set confidence = excluded.confidence, method = excluded.method`,
      [canonicalId, rawListingId, dedupeResult.confidence, dedupeResult.method],
    );

    // Photo filter — reject obvious junk before insert (logos, sprites, footers, tiny images)
    photos = photos.map(p => {
      const annotated = p as RawPhoto & { reject_reason?: string };
      const r = classifyPhoto(p);
      if (r) annotated.reject_reason = r;
      return annotated;
    });

    // Photos: insert non-rejected, non-duplicate URLs
    if (photos.length) {
      const existing = await client.query<{ url_source: string; phash: string | null }>(
        `select url_source, phash from photos where canonical_listing_id = $1`,
        [canonicalId],
      );
      const existingUrls = new Set(existing.rows.map(r => r.url_source));
      const existingPhashes = new Set(existing.rows.map(r => r.phash).filter(Boolean));
      let pos = 0;
      for (const p of photos as Array<RawPhoto & { phash?: string; reject_reason?: string }>) {
        if (existingUrls.has(p.url)) continue;
        if (p.phash && existingPhashes.has(p.phash)) continue;
        const isHero = pos === (enriched.hero_photo_index ?? 0);
        const altText = enriched.photos_alt?.[String(pos)] ?? p.alt ?? null;
        const isRejected = !!p.reject_reason;
        await client.query(
          `insert into photos (canonical_listing_id, url_source, width, height, position, alt_text_en, is_hero, phash, is_rejected, reject_reason)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [canonicalId, p.url, p.width ?? null, p.height ?? null, pos, altText, isHero, p.phash ?? null, isRejected, p.reject_reason ?? null],
        );
        if (!isRejected) photosInserted++;
        pos++;
      }
    }

    // Persist enriched + photo_count on canonical
    await client.query(
      `update canonical_listings
          set photo_count = (select count(*)::int from photos where canonical_listing_id = $1 and not is_rejected)
        where id = $1`,
      [canonicalId],
    );
    await client.query(
      `update raw_listings set publish_status = 'done', enriched = $2::jsonb where id = $1`,
      [rawListingId, JSON.stringify(enriched)],
    );

    await client.query('COMMIT');
    return { canonical_listing_id: canonicalId, action, photos_inserted: photosInserted };
  } catch (e) {
    await client.query('ROLLBACK');
    logger.error({ err: (e as Error).message, rawListingId }, 'publish.failed');
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Build the column lists + value arrays for both INSERT (full row) and UPDATE
 * (merge). Centralises the field mapping so adding a new column only needs an
 * entry here.
 */
function buildCanonicalRow(e: EnrichedListing & { primary_source_url?: string | null }, _dedupe: DedupeResult) {
  // [columnName, value, mergeMode]
  // mergeMode: 'coalesce' (only fill nulls) | 'overwrite' (always replace)
  const fields: Array<[string, unknown, 'coalesce' | 'overwrite']> = [
    ['slug', e.slug, 'coalesce'],
    ['property_type', e.property_type ?? 'other', 'coalesce'],

    // Titles & copy
    ['title_en', e.title_en ?? null, 'overwrite'],
    ['title_es', e.title_es ?? null, 'overwrite'],
    ['description_en', e.description_en ?? null, 'overwrite'],
    ['description_es', e.description_es ?? null, 'overwrite'],
    ['description_raw', e.description_raw ?? e.description ?? null, 'overwrite'],

    // Pricing
    ['price', e.price ?? null, 'overwrite'],
    ['price_currency', e.price_currency ?? null, 'overwrite'],
    ['price_usd', e.price_usd ?? null, 'overwrite'],
    ['price_per_sqm', e.price_per_sqm ?? null, 'overwrite'],
    ['list_price_original_usd', e.list_price_original_usd ?? null, 'coalesce'],
    ['hoa_fee_usd', e.hoa_fee_usd ?? null, 'overwrite'],
    ['hoa_fee_frequency', e.hoa_fee_frequency ?? null, 'coalesce'],
    ['hoa_amenities', e.hoa_amenities ?? [], 'overwrite'],
    ['hoa_name', e.hoa_name ?? null, 'coalesce'],
    ['taxes_usd_annual', e.taxes_usd_annual ?? null, 'coalesce'],
    ['tax_year', e.tax_year ?? null, 'coalesce'],
    ['rental_income_potential', e.rental_income_potential ?? null, 'coalesce'],

    // Bath detail
    ['bathrooms', e.bathrooms ?? null, 'overwrite'],
    ['bathrooms_full', e.bathrooms_full ?? null, 'coalesce'],
    ['bathrooms_half', e.bathrooms_half ?? null, 'coalesce'],

    // Dimensions
    ['bedrooms', e.bedrooms ?? null, 'overwrite'],
    ['interior_sqm', e.interior_sqm ?? null, 'overwrite'],
    ['lot_sqm', e.lot_sqm ?? null, 'overwrite'],
    ['year_built', e.year_built ?? null, 'coalesce'],
    ['year_renovated', e.year_renovated ?? null, 'coalesce'],
    ['stories_total', e.stories_total ?? null, 'coalesce'],
    ['floor_number', e.floor_number ?? null, 'coalesce'],
    ['total_floors_in_bldg', e.total_floors_in_bldg ?? null, 'coalesce'],
    ['construction_status', e.construction_status ?? null, 'coalesce'],
    ['condition', e.condition ?? null, 'coalesce'],
    ['architectural_style', e.architectural_style ?? null, 'coalesce'],

    // Parking / pool / view / waterfront
    ['parking_spaces', e.parking_spaces ?? null, 'coalesce'],
    ['garage_spaces', e.garage_spaces ?? null, 'coalesce'],
    ['parking_features', e.parking_features ?? [], 'overwrite'],
    ['pool_features', e.pool_features ?? [], 'overwrite'],
    ['view_types', e.view_types ?? [], 'overwrite'],
    ['waterfront_yn', e.waterfront_yn ?? null, 'coalesce'],
    ['waterfront_features', e.waterfront_features ?? [], 'overwrite'],
    ['beachfront_yn', e.beachfront_yn ?? null, 'coalesce'],

    // Features / interior
    ['features', e.features ?? [], 'overwrite'],
    ['interior_features', e.interior_features ?? [], 'overwrite'],
    ['exterior_features', e.exterior_features ?? [], 'overwrite'],
    ['appliances', e.appliances ?? [], 'overwrite'],
    ['flooring', e.flooring ?? [], 'overwrite'],
    ['cooling', e.cooling ?? [], 'overwrite'],
    ['heating', e.heating ?? [], 'overwrite'],
    ['furnishings_included', e.furnishings_included ?? null, 'coalesce'],
    ['tags_ai', e.tags_ai ?? [], 'overwrite'],

    // CR-specific
    ['title_status', e.title_status ?? null, 'coalesce'],
    ['maritime_zone', e.maritime_zone ?? null, 'coalesce'],
    ['foreigner_buyable', e.foreigner_buyable ?? null, 'coalesce'],
    ['road_access', e.road_access ?? null, 'coalesce'],
    ['water_source', e.water_source ?? null, 'coalesce'],
    ['electricity', e.electricity ?? null, 'coalesce'],
    ['internet_quality', e.internet_quality ?? null, 'coalesce'],
    ['zoning', e.zoning ?? null, 'coalesce'],

    // Location
    ['region_slug', e.region_slug ?? null, 'overwrite'],
    ['province', e.province ?? null, 'coalesce'],
    ['canton', e.canton ?? null, 'coalesce'],
    ['district', e.district ?? null, 'coalesce'],
    ['locality', e.locality ?? null, 'coalesce'],
    ['address_line', e.address_line ?? null, 'coalesce'],
    ['postal_code', e.postal_code ?? null, 'coalesce'],
    ['country', 'CR', 'overwrite'],
    ['community_name', e.community_name ?? null, 'coalesce'],
    ['building_name', e.building_name ?? null, 'coalesce'],
    ['gated_community', e.gated_community ?? null, 'coalesce'],
    ['lat', e.lat ?? null, 'coalesce'],
    ['lng', e.lng ?? null, 'coalesce'],
    ['geocode_confidence', e.geocode_confidence ?? null, 'coalesce'],

    // Distances
    ['distance_to_beach_km', e.distance_to_beach_km ?? null, 'overwrite'],
    ['distance_to_airport_km', e.distance_to_airport_km ?? null, 'overwrite'],
    ['nearest_airport_code', e.nearest_airport_code ?? null, 'overwrite'],
    ['distance_to_hospital_km', e.distance_to_hospital_km ?? null, 'overwrite'],
    ['nearest_hospital_name', e.nearest_hospital_name ?? null, 'overwrite'],
    ['distance_to_school_km', e.distance_to_school_km ?? null, 'overwrite'],
    ['nearest_school_name', e.nearest_school_name ?? null, 'overwrite'],

    // Lifecycle
    ['listed_at', e.listed_at ?? null, 'coalesce'],
    ['mls_id', e.mls_id ?? null, 'coalesce'],
    ['mls_status', e.mls_status ?? null, 'coalesce'],

    // Agent / brokerage
    ['listing_agent_name', e.listing_agent_name ?? null, 'coalesce'],
    ['listing_agent_phone', e.listing_agent_phone ?? null, 'coalesce'],
    ['listing_agent_email', e.listing_agent_email ?? null, 'coalesce'],
    ['source_brokerage', e.source_brokerage ?? null, 'coalesce'],
    ['source_brokerage_phone', e.source_brokerage_phone ?? null, 'coalesce'],
    ['primary_source_url', e.primary_source_url ?? null, 'coalesce'],

    // Media
    ['virtual_tour_url', e.virtual_tour_url ?? null, 'coalesce'],
    ['video_url', e.video_url ?? null, 'coalesce'],
    ['floorplan_url', e.floorplan_url ?? null, 'coalesce'],
    ['floorplans', JSON.stringify(e.floorplans ?? []), 'overwrite'],

    // Catch-all
    ['notes', e.notes ?? null, 'coalesce'],
    ['extra_data', JSON.stringify(e.extra_data ?? {}), 'overwrite'],
  ];

  // For INSERT: all columns
  const insert = {
    columns: fields.map(f => f[0]),
    values: fields.map(f => f[1]),
  };

  // For UPDATE / merge: only include fields where value isn't null OR mode is 'overwrite'
  const mergeFields = fields.filter(([, v, mode]) => mode === 'overwrite' || v != null);
  const merge = {
    setColumns: mergeFields.map(f => f[0]),
    values: mergeFields.map(f => f[1]),
  };

  return { insert, merge };
}

/** URL + dimension classifier. Returns reject_reason if photo is junk. */
function classifyPhoto(p: RawPhoto): string | null {
  const url = p.url.toLowerCase();
  if (/\b(footer|logo|sprite|icon|badge|banner|placeholder|watermark|favicon|avatar)\b/.test(url)) return 'logo_or_branding';
  if (/casas24|carros24|encuentra24[-_]badge|google[-_]play|app[-_]store/.test(url)) return 'site_branding';
  if (/\.(svg|gif)(\?|$)/.test(url)) return 'icon';
  // Tiny images are usually icons. Only reject if dimensions are present and small.
  if (p.width != null && p.height != null) {
    if (p.width < 300 || p.height < 200) return 'tiny';
    const ar = p.width / p.height;
    if (ar < 0.4 || ar > 4) return 'unusual_aspect_ratio';
  }
  return null;
}
