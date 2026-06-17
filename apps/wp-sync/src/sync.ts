/**
 * Pull canonical_listings needing sync, push them to Houzez, log results.
 */
import { pgQuery, logger, env, Limits } from '@crdg/core';
import { wp } from './wp-client.js';
import { computeContentHash, mapToHouzez, type CanonicalRow } from './field-mapping.js';
import { ensurePhotoUploaded } from './photo-pipeline.js';
import pLimit from 'p-limit';

interface PhotoRow {
  id: string;
  url_source: string;
  url_supabase: string | null;
  wp_media_id: number | null;
  alt_text_en: string | null;
  is_hero: boolean;
  position: number;
  status: string;
}

const termCache = new Map<string, number>();

async function ensureTerm(taxonomy: string, name: string): Promise<number> {
  const key = `${taxonomy}::${name}`;
  if (termCache.has(key)) return termCache.get(key)!;
  const r = await wp.upsertTerm(taxonomy, name);
  termCache.set(key, r.id);
  return r.id;
}

async function fetchPhotos(canonicalId: string): Promise<PhotoRow[]> {
  return pgQuery<PhotoRow>(`
    select id, url_source, url_supabase, wp_media_id, alt_text_en, is_hero, position, status
    from photos
    where canonical_listing_id = $1
    order by position
    limit $2
  `, [canonicalId, Limits.photos.maxPerListing]);
}

async function syncOne(row: CanonicalRow): Promise<{ action: 'create' | 'update' | 'skip'; wpPostId?: number; error?: string }> {
  const start = Date.now();
  const hash = computeContentHash(row);
  if (row.wp_post_id && row.wp_content_hash === hash) {
    return { action: 'skip', wpPostId: row.wp_post_id };
  }

  const payload = mapToHouzez(row);

  // Resolve taxonomies first (skip in dry-run; ensureTerm calls real WP)
  const tagIds: Record<string, number[]> = {};
  if (!env.wp.dryRun) {
    for (const [taxonomy, names] of Object.entries(payload.taxonomies)) {
      tagIds[taxonomy] = [];
      for (const n of names) {
        try { tagIds[taxonomy]!.push(await ensureTerm(taxonomy, n)); } catch (e) {
          logger.warn({ taxonomy, name: n, err: (e as Error).message }, 'wp.term.failed');
        }
      }
    }
  }

  const fullBody: Record<string, unknown> = {
    ...payload.postFields,
    meta: payload.meta,
    ...tagIds,
  };

  if (env.wp.dryRun) {
    await pgQuery(`
      insert into sync_log (canonical_listing_id, wp_post_id, action, status, wp_response, duration_ms)
      values ($1, $2, $3, 'dry_run', $4, $5)
    `, [row.id, row.wp_post_id, row.wp_post_id ? 'update' : 'create', JSON.stringify(fullBody).slice(0, 4000), Date.now() - start]);
    return { action: row.wp_post_id ? 'update' : 'create', wpPostId: row.wp_post_id ?? undefined };
  }

  let action: 'create' | 'update';
  let resp: { id: number; link: string };
  try {
    if (row.wp_post_id) {
      action = 'update';
      resp = await wp.updateProperty(row.wp_post_id, fullBody);
    } else {
      action = 'create';
      resp = await wp.createProperty(fullBody);
    }
  } catch (e) {
    const err = e as Error & { status?: number };
    await pgQuery(`
      insert into sync_log (canonical_listing_id, wp_post_id, action, status, http_status, error, duration_ms)
      values ($1, $2, $3, 'failed', $4, $5, $6)
    `, [row.id, row.wp_post_id, row.wp_post_id ? 'update' : 'create', err.status ?? null, err.message, Date.now() - start]);
    return { action: row.wp_post_id ? 'update' : 'create', error: err.message };
  }

  // Upload photos (skip if already uploaded). Hero first.
  const photos = await fetchPhotos(row.id);
  const featuredFromHero = photos.find(p => p.is_hero) ?? photos[0];
  const galleryIds: number[] = [];
  let featuredId: number | null = null;

  for (const p of photos) {
    if (p.wp_media_id) {
      galleryIds.push(p.wp_media_id);
      if (p === featuredFromHero) featuredId = p.wp_media_id;
      continue;
    }
    try {
      const up = await ensurePhotoUploaded({
        url_source: p.url_source,
        alt: p.alt_text_en ?? row.title_en ?? '',
      });
      await pgQuery(
        `update photos set wp_media_id=$2, url_supabase=$3, width=$4, height=$5, status='uploaded_wp' where id=$1`,
        [p.id, up.wp_media_id, up.source_url, up.width, up.height],
      );
      galleryIds.push(up.wp_media_id);
      if (p === featuredFromHero) featuredId = up.wp_media_id;
    } catch (e) {
      logger.warn({ photoId: p.id, err: (e as Error).message }, 'wp.photo.failed');
      await pgQuery(`update photos set status='failed' where id=$1`, [p.id]);
    }
  }

  // Attach featured image + gallery via meta update
  if (featuredId || galleryIds.length) {
    const galleryMeta = {
      ...(featuredId ? { featured_media: featuredId } : {}),
      meta: {
        ...payload.meta,
        ...(galleryIds.length ? { fave_property_images: galleryIds.join(',') } : {}),
      },
    };
    try {
      await wp.updateProperty(resp.id, galleryMeta);
    } catch (e) {
      logger.warn({ err: (e as Error).message, postId: resp.id }, 'wp.gallery.failed');
    }
  }

  // Mark canonical as synced
  await pgQuery(`
    update canonical_listings
    set wp_post_id = $2, wp_synced_at = now(), wp_content_hash = $3
    where id = $1
  `, [row.id, resp.id, hash]);

  await pgQuery(`
    insert into sync_log (canonical_listing_id, wp_post_id, action, status, http_status, wp_response, duration_ms)
    values ($1, $2, $3, 'success', 200, $4, $5)
  `, [row.id, resp.id, action, JSON.stringify({ link: resp.link }), Date.now() - start]);

  return { action, wpPostId: resp.id };
}

export async function syncPending(opts: { limit?: number } = {}): Promise<{ ok: number; skipped: number; failed: number }> {
  if (env.wp.dryRun) {
    logger.info({ baseUrl: env.wp.baseUrl, user: env.wp.username }, 'wp.dry_run.skip_ping');
  } else {
    const ping = await wp.ping();
    if (!ping.ok) {
      logger.error({ err: ping.error, baseUrl: env.wp.baseUrl, user: env.wp.username }, 'wp.ping.failed');
      throw new Error(`WordPress unreachable or auth failed: ${ping.error}`);
    }
    logger.info({ user: ping.user, baseUrl: env.wp.baseUrl }, 'wp.ping.ok');
  }

  const rows = await pgQuery<CanonicalRow>(`
    select * from canonical_listings
    where status in ('active','pending_review')
      and (wp_synced_at is null or updated_at > wp_synced_at)
    order by updated_at desc
    limit $1
  `, [opts.limit ?? 200]);

  if (rows.length === 0) {
    logger.info('wp.sync.nothing_pending');
    return { ok: 0, skipped: 0, failed: 0 };
  }

  logger.info({ count: rows.length }, 'wp.sync.start');

  let ok = 0, skipped = 0, failed = 0;
  // Process in batches with pause between batches
  for (let i = 0; i < rows.length; i += Limits.wp.batchSize) {
    const batch = rows.slice(i, i + Limits.wp.batchSize);
    const limit = pLimit(3);
    const results = await Promise.all(batch.map(r => limit(() => syncOne(r))));
    for (const r of results) {
      if (r.error) failed++;
      else if (r.action === 'skip') skipped++;
      else ok++;
    }
    logger.info({ batch: i / Limits.wp.batchSize + 1, ok, skipped, failed }, 'wp.sync.batch_done');
    if (i + Limits.wp.batchSize < rows.length) {
      await new Promise(r => setTimeout(r, Limits.wp.pauseBetweenBatchesMs));
    }
  }

  logger.info({ ok, skipped, failed, total: rows.length }, 'wp.sync.done');
  return { ok, skipped, failed };
}
