import { pgQuery, logger } from '@crdg/core';
import { runPipeline } from '@crdg/ai';
import type { RawListingPayload } from '@crdg/core';

async function main() {
  const rows = await pgQuery<{ id: string; source_url: string; raw_extracted: unknown; photos: unknown }>(
    `select id, source_url, raw_extracted, photos
     from raw_listings
     where publish_status in ('pending','failed','skipped')
        or extract_status in ('pending','failed','skipped','running')
     order by scraped_at desc`
  );
  logger.info({ count: rows.length }, 'repipe.start');
  let ok = 0, fail = 0, totalCost = 0;
  for (const r of rows) {
    try {
      const photos = Array.isArray(r.photos) ? r.photos : [];
      const result = await runPipeline(r.id, {
        source_listing_id: 'x',
        source_url: r.source_url,
        raw_extracted: (r.raw_extracted ?? undefined) as RawListingPayload['raw_extracted'],
        photos: photos as RawListingPayload['photos'],
      });
      totalCost += result.costUsd ?? 0;
      if (result.failedStage) {
        fail++;
        logger.warn({ rawId: r.id, stage: result.failedStage, err: result.error }, 'repipe.failed');
      } else {
        ok++;
        logger.info({ rawId: r.id, costUsd: result.costUsd, canonicalId: result.canonical_listing_id }, 'repipe.ok');
      }
    } catch (e) {
      fail++;
      logger.error({ rawId: r.id, err: (e as Error).message }, 'repipe.err');
    }
  }
  logger.info({ ok, fail, totalCost: Number(totalCost.toFixed(4)) }, 'repipe.done');
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
