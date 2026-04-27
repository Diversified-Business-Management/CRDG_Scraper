/**
 * Orchestrates one source-run: enumerate URLs, fetch detail pages, run AI pipeline, publish.
 */
import { pgQuery, logger, Limits, BudgetExceededError } from '@crdg/core';
import type { SourceAdapter, RawListingPayload } from '@crdg/core';
import type { RunHandle } from './run-state.js';
import pLimit from 'p-limit';

interface SourceConfigRow {
  source_id: string;
  cron_expression: string;
  rate_limit_rps: number;
  burst: number;
  max_listings_per_run: number;
  regions: string[];
  metadata: Record<string, unknown>;
}

export async function getSourceConfig(sourceSlug: string): Promise<SourceConfigRow> {
  const rows = await pgQuery<SourceConfigRow>(`
    select sc.source_id, sc.cron_expression, sc.rate_limit_rps, sc.burst,
           sc.max_listings_per_run, sc.regions, sc.metadata
    from source_configs sc
    join sources s on s.id = sc.source_id
    where s.slug = $1
  `, [sourceSlug]);
  if (!rows[0]) throw new Error(`No source_config for ${sourceSlug}`);
  return rows[0];
}

interface SourceMetrics {
  errorsTotal: number;
  errors5xx: number;
  fetched: number;
}

export async function runSource(
  adapter: SourceAdapter,
  run: RunHandle,
  opts: { maxListings?: number; pipeline: PipelineFns } = { pipeline: NULL_PIPELINE },
): Promise<{ listingsSeen: number; listingsNew: number; listingsFailed: number }> {
  const cfg = await getSourceConfig(adapter.slug);
  const cap = Math.min(opts.maxListings ?? cfg.max_listings_per_run, Limits.perSource.maxListingsPerRun);

  await run.log('orchestrator', 'info', `Enumerating up to ${cap} listings`, { regions: cfg.regions });

  const metrics: SourceMetrics = { errorsTotal: 0, errors5xx: 0, fetched: 0 };
  const ctrl = new AbortController();
  const limit = pLimit(2);                 // 2 concurrent listing fetches
  const pipelineLimit = pLimit(Limits.ai.maxConcurrent);

  let seen = 0, newCount = 0, failed = 0;
  let paused = false;

  const checkAutoPause = async () => {
    if (metrics.fetched < 30) return; // need a sample size
    const errRate = metrics.errorsTotal / metrics.fetched;
    const fiveRate = metrics.errors5xx / metrics.fetched;
    if (errRate > Limits.perSource.autoPauseErrorRate || fiveRate > Limits.perSource.autoPause5xxRate) {
      paused = true;
      ctrl.abort();
      await run.log('orchestrator', 'warn', `Auto-pausing source: error_rate=${errRate.toFixed(2)} 5xx_rate=${fiveRate.toFixed(2)}`);
    }
  };

  const tasks: Promise<unknown>[] = [];

  try {
    for await (const url of adapter.enumerateListingUrls({
      regions: cfg.regions as never,
      maxListings: cap,
      signal: ctrl.signal,
    })) {
      if (paused) break;
      if (seen >= cap) break;
      seen++; run.bumpSeen();

      tasks.push(limit(async () => {
        let rawId: string | null = null;
        let raw: RawListingPayload | null = null;
        try {
          raw = await adapter.fetchListing(url);
          metrics.fetched++;
          await checkAutoPause();

          // Insert raw_listing
          const inserted = await pgQuery<{ id: string; was_new: boolean }>(`
            insert into raw_listings (source_id, source_listing_id, source_url, run_id, raw_html, raw_extracted, photos)
            values ($1, $2, $3, $4, $5, $6, $7)
            on conflict (source_id, source_listing_id) do update set
              source_url = excluded.source_url,
              run_id = excluded.run_id,
              raw_html = excluded.raw_html,
              raw_extracted = excluded.raw_extracted,
              photos = excluded.photos,
              scraped_at = now(),
              extract_status = 'pending',
              normalize_status = 'pending',
              dedupe_status = 'pending',
              enrich_status = 'pending',
              publish_status = 'pending',
              error_jsonb = null
            returning id, (xmax = 0) as was_new
          `, [
            (await getSourceIdBySlug(adapter.slug)),
            raw.source_listing_id,
            raw.source_url,
            run.id,
            raw.raw_html ?? null,
            raw.raw_extracted ? JSON.stringify(raw.raw_extracted) : null,
            JSON.stringify(raw.photos ?? []),
          ]);
          rawId = inserted[0]!.id;
          if (inserted[0]!.was_new) newCount++, run.bumpNew();
          else run.bumpUpdated();
        } catch (e) {
          metrics.errorsTotal++;
          const err = e as Error & { status?: number };
          if (err.status && err.status >= 500) metrics.errors5xx++;
          await run.log('fetch', 'error', `Fetch failed for ${url}: ${err.message}`, { url });
          run.bumpFailed(); failed++;
          await checkAutoPause();
          return;
        }

        // Run AI pipeline inline (still concurrency-limited via outer fetch limiter
        // and the pipeline limiter). Awaiting here means the outer task only resolves
        // after the pipeline completes, so Promise.all(tasks) waits for everything.
        await pipelineLimit(async () => {
          try {
            const pipelineCost = await opts.pipeline.runAll(rawId!, raw!, run);
            run.addCost(pipelineCost);
          } catch (e) {
            if (e instanceof BudgetExceededError) {
              paused = true;
              ctrl.abort();
              await run.log('pipeline', 'warn', `Budget exceeded, halting source: ${e.message}`);
              return;
            }
            const err = e as Error;
            await run.log('pipeline', 'error', `Pipeline failed for ${url}: ${err.message}`, { stack: err.stack });
            run.bumpFailed(); failed++;
          }
        });
      }));
    }

    await Promise.all(tasks);
  } catch (e) {
    if ((e as Error).name !== 'AbortError') throw e;
  }

  return { listingsSeen: seen, listingsNew: newCount, listingsFailed: failed };
}

const sourceIdCache = new Map<string, string>();
async function getSourceIdBySlug(slug: string): Promise<string> {
  if (sourceIdCache.has(slug)) return sourceIdCache.get(slug)!;
  const rows = await pgQuery<{ id: string }>('select id from sources where slug = $1', [slug]);
  if (!rows[0]) throw new Error(`Unknown source slug ${slug}`);
  sourceIdCache.set(slug, rows[0].id);
  return rows[0].id;
}

export interface PipelineFns {
  runAll(rawId: string, raw: RawListingPayload, run: RunHandle): Promise<number>; // returns cost in USD
}

const NULL_PIPELINE: PipelineFns = {
  async runAll() { return 0; },
};

export { NULL_PIPELINE };
