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
 * - action='merge': UPDATE existing canonical_listings + insert into dedup_links + insert non-duplicate photos.
 * - action='create' or 'review': INSERT new canonical_listings (status='active' or 'pending_review').
 * - Always: update raw_listings.publish_status and raw_listings.enriched.
 */
export async function publish(
  rawListingId: string,
  enriched: EnrichedListing,
  dedupeResult: DedupeResult,
  photos: RawPhoto[],
): Promise<PublishResult> {
  const pool = getPgPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let canonicalId: string;
    let action: 'merge' | 'create' | 'review';
    let photosInserted = 0;

    if (dedupeResult.action === 'merge' && dedupeResult.canonical_listing_id) {
      canonicalId = dedupeResult.canonical_listing_id;
      action = 'merge';
      // Update fields that may have changed since last seen
      await client.query(
        `update canonical_listings
            set title_en = coalesce($2, title_en),
                title_es = coalesce($3, title_es),
                description_en = coalesce($4, description_en),
                description_es = coalesce($5, description_es),
                description_raw = coalesce($6, description_raw),
                price = coalesce($7, price),
                price_currency = coalesce($8, price_currency),
                price_usd = coalesce($9, price_usd),
                price_per_sqm = coalesce($10, price_per_sqm),
                bedrooms = coalesce($11, bedrooms),
                bathrooms = coalesce($12, bathrooms),
                interior_sqm = coalesce($13, interior_sqm),
                lot_sqm = coalesce($14, lot_sqm),
                year_built = coalesce($15, year_built),
                region_slug = coalesce($16, region_slug),
                province = coalesce($17, province),
                canton = coalesce($18, canton),
                district = coalesce($19, district),
                locality = coalesce($20, locality),
                address_line = coalesce($21, address_line),
                lat = coalesce($22, lat),
                lng = coalesce($23, lng),
                geocode_confidence = coalesce($24, geocode_confidence),
                features = $25,
                tags_ai = $26,
                last_seen_at = now(),
                updated_at = now()
          where id = $1`,
        [
          canonicalId,
          enriched.title_en, enriched.title_es,
          enriched.description_en, enriched.description_es, enriched.description_raw,
          enriched.price, enriched.price_currency, enriched.price_usd, enriched.price_per_sqm,
          enriched.bedrooms, enriched.bathrooms, enriched.interior_sqm, enriched.lot_sqm,
          enriched.year_built,
          enriched.region_slug, enriched.province, enriched.canton, enriched.district,
          enriched.locality, enriched.address_line,
          enriched.lat, enriched.lng, enriched.geocode_confidence,
          enriched.features ?? [], enriched.tags_ai ?? [],
        ],
      );
    } else {
      action = dedupeResult.action === 'review' ? 'review' : 'create';
      const status = action === 'review' ? 'pending_review' : 'active';
      const inserted = await client.query<{ id: string }>(
        `insert into canonical_listings (
           slug, status, listing_type, property_type,
           title_en, title_es, description_en, description_es, description_raw,
           price, price_currency, price_usd, price_per_sqm,
           bedrooms, bathrooms, interior_sqm, lot_sqm, year_built,
           region_slug, province, canton, district, locality, address_line,
           lat, lng, geocode_confidence,
           features, tags_ai,
           hoa_fee_usd, taxes_usd_annual, mls_id,
           listed_at, last_seen_at, created_at, updated_at
         ) values (
           $1,$2,'sale',$3,
           $4,$5,$6,$7,$8,
           $9,$10,$11,$12,
           $13,$14,$15,$16,$17,
           $18,$19,$20,$21,$22,$23,
           $24,$25,$26,
           $27,$28,
           $29,$30,$31,
           $32, now(), now(), now()
         ) returning id`,
        [
          enriched.slug, status, enriched.property_type ?? 'other',
          enriched.title_en, enriched.title_es, enriched.description_en, enriched.description_es, enriched.description_raw,
          enriched.price, enriched.price_currency, enriched.price_usd, enriched.price_per_sqm,
          enriched.bedrooms, enriched.bathrooms, enriched.interior_sqm, enriched.lot_sqm, enriched.year_built,
          enriched.region_slug, enriched.province, enriched.canton, enriched.district, enriched.locality, enriched.address_line,
          enriched.lat, enriched.lng, enriched.geocode_confidence,
          enriched.features ?? [], enriched.tags_ai ?? [],
          enriched.hoa_fee_usd ?? null, enriched.taxes_usd_annual ?? null, enriched.mls_id ?? null,
          enriched.listed_at ?? null,
        ],
      );
      canonicalId = inserted.rows[0]!.id;

      // Embedding row, if we have it
      if (dedupeResult.embedding && dedupeResult.embedding.length > 0) {
        const literal = `[${dedupeResult.embedding.join(',')}]`;
        await client.query(
          `insert into listing_embeddings (canonical_listing_id, embedding, model, text_hash)
           values ($1, $2::vector, $3, $4)
           on conflict (canonical_listing_id) do update
             set embedding = excluded.embedding, model = excluded.model, text_hash = excluded.text_hash`,
          [canonicalId, literal, process.env['VOYAGE_API_KEY'] ? 'voyage-2' : 'hash-dev', dedupeResult.text_hash],
        );
      }
    }

    // Always insert dedup_links row tying this raw row to the canonical
    await client.query(
      `insert into dedup_links (canonical_listing_id, raw_listing_id, confidence, method)
       values ($1, $2, $3, $4)
       on conflict (canonical_listing_id, raw_listing_id) do update
         set confidence = excluded.confidence, method = excluded.method`,
      [canonicalId, rawListingId, dedupeResult.confidence, dedupeResult.method],
    );

    // Photos: insert each, skipping URL duplicates on the canonical
    if (photos.length) {
      const existing = await client.query<{ url_source: string; phash: string | null }>(
        `select url_source, phash from photos where canonical_listing_id = $1`,
        [canonicalId],
      );
      const existingUrls = new Set(existing.rows.map((r) => r.url_source));
      const existingPhashes = new Set(existing.rows.map((r) => r.phash).filter(Boolean));
      let pos = 0;
      for (const p of photos) {
        if (existingUrls.has(p.url)) continue;
        const phash = (p as RawPhoto & { phash?: string }).phash;
        if (phash && existingPhashes.has(phash)) continue;
        const isHero = pos === (enriched.hero_photo_index ?? 0);
        const altText = enriched.photos_alt?.[String(pos)] ?? p.alt ?? null;
        await client.query(
          `insert into photos (canonical_listing_id, url_source, width, height, position, alt_text, is_hero, phash)
           values ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [canonicalId, p.url, p.width ?? null, p.height ?? null, pos, altText, isHero, phash ?? null],
        );
        photosInserted++;
        pos++;
      }
    }

    // Update raw_listings: publish complete + persist enriched JSON
    await client.query(
      `update raw_listings
          set publish_status = 'done',
              enriched = $2::jsonb
        where id = $1`,
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
