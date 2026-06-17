import { logger, pgQuery, type RawListingPayload } from '@crdg/core';
import { extract } from './extract.js';
import { normalize } from './normalize.js';
import { dedupe, type DedupeResult } from './dedupe.js';
import { enrich } from './enrich.js';
import { publish } from './publish.js';

export { extract } from './extract.js';
export { normalize, lookupRegionByLocality, lookupRegionByCoords, buildSlug } from './normalize.js';
export { dedupe, embed, hashEmbedding, buildEmbeddingText, type DedupeResult, type DedupeAction, type DedupeOpts } from './dedupe.js';
export { enrich } from './enrich.js';
export { publish, type PublishResult } from './publish.js';

type Stage = 'extract' | 'normalize' | 'dedupe' | 'enrich' | 'publish';

async function setStageStatus(rawId: string, stage: Stage, status: 'running' | 'done' | 'failed', errorJson?: unknown) {
  const col = `${stage}_status`;
  await pgQuery(
    `update raw_listings set ${col} = $2, error_jsonb = coalesce($3::jsonb, error_jsonb) where id = $1`,
    [rawId, status, errorJson ? JSON.stringify(errorJson) : null],
  ).catch((e) => logger.warn({ err: (e as Error).message, stage, rawId }, 'pipeline.setStageStatus_failed'));
}

async function bumpCost(rawId: string, deltaUsd: number) {
  if (deltaUsd <= 0) return;
  await pgQuery(
    `update raw_listings set cost_usd = coalesce(cost_usd, 0) + $2 where id = $1`,
    [rawId, deltaUsd],
  ).catch((e) => logger.warn({ err: (e as Error).message, rawId }, 'pipeline.bumpCost_failed'));
}

async function logRunEvent(runId: string | undefined, stage: Stage, level: 'info' | 'warn' | 'error', message: string, data?: unknown) {
  if (!runId) return;
  await pgQuery(
    `insert into run_logs (run_id, stage, level, message, data, created_at)
     values ($1, $2, $3, $4, $5::jsonb, now())`,
    [runId, stage, level, message, data ? JSON.stringify(data) : null],
  ).catch(() => { /* logging is best-effort */ });
}

export interface RunPipelineOpts {
  runId?: string;
  /** If provided, skip a stage by name. Useful for selective re-runs. */
  skipStages?: Stage[];
}

/**
 * Convenience: run all five stages in sequence for a single raw_listings row.
 * Each stage updates the corresponding *_status column; on failure, marks the
 * stage as 'failed' and returns early without throwing further stages.
 */
export async function runPipeline(rawId: string, raw: RawListingPayload, opts: RunPipelineOpts = {}) {
  const skip = new Set(opts.skipStages ?? []);
  const result: {
    rawId: string;
    extracted?: unknown;
    normalized?: unknown;
    dedupe?: DedupeResult;
    enriched?: unknown;
    canonical_listing_id?: string;
    costUsd: number;
    failedStage?: Stage;
    error?: string;
  } = { rawId, costUsd: 0 };

  // Stage 1: extract
  if (!skip.has('extract')) {
    await setStageStatus(rawId, 'extract', 'running');
    try {
      const r = await extract(raw, { runId: opts.runId });
      await bumpCost(rawId, r.costUsd);
      await setStageStatus(rawId, 'extract', 'done');
      await logRunEvent(opts.runId, 'extract', 'info', 'extract.done', { costUsd: r.costUsd });
      result.extracted = r.extracted;
      result.costUsd += r.costUsd;
    } catch (e) {
      const err = e as Error;
      await setStageStatus(rawId, 'extract', 'failed', { message: err.message });
      await logRunEvent(opts.runId, 'extract', 'error', err.message);
      logger.error({ err: err.message, rawId }, 'pipeline.extract.failed');
      result.failedStage = 'extract';
      result.error = err.message;
      return result;
    }
  }

  // Stage 2: normalize
  if (!skip.has('normalize') && result.extracted) {
    await setStageStatus(rawId, 'normalize', 'running');
    try {
      const n = await normalize(result.extracted as never);
      await setStageStatus(rawId, 'normalize', 'done');
      result.normalized = n;
    } catch (e) {
      const err = e as Error;
      await setStageStatus(rawId, 'normalize', 'failed', { message: err.message });
      await logRunEvent(opts.runId, 'normalize', 'error', err.message);
      logger.error({ err: err.message, rawId }, 'pipeline.normalize.failed');
      result.failedStage = 'normalize';
      result.error = err.message;
      return result;
    }
  }

  // Stage 3: dedupe
  if (!skip.has('dedupe') && result.normalized) {
    await setStageStatus(rawId, 'dedupe', 'running');
    try {
      const d = await dedupe(result.normalized as never);
      await bumpCost(rawId, d.costUsd);
      await setStageStatus(rawId, 'dedupe', 'done');
      await logRunEvent(opts.runId, 'dedupe', 'info', 'dedupe.done', { action: d.result.action, confidence: d.result.confidence });
      result.dedupe = d.result;
      result.costUsd += d.costUsd;
    } catch (e) {
      const err = e as Error;
      await setStageStatus(rawId, 'dedupe', 'failed', { message: err.message });
      await logRunEvent(opts.runId, 'dedupe', 'error', err.message);
      logger.error({ err: err.message, rawId }, 'pipeline.dedupe.failed');
      result.failedStage = 'dedupe';
      result.error = err.message;
      return result;
    }
  }

  // Stage 4: enrich
  if (!skip.has('enrich') && result.normalized) {
    await setStageStatus(rawId, 'enrich', 'running');
    try {
      const e = await enrich(result.normalized as never, raw);
      await bumpCost(rawId, e.costUsd);
      await setStageStatus(rawId, 'enrich', 'done');
      await logRunEvent(opts.runId, 'enrich', 'info', 'enrich.done', { costUsd: e.costUsd });
      result.enriched = e.enriched;
      result.costUsd += e.costUsd;
    } catch (err0) {
      const err = err0 as Error;
      await setStageStatus(rawId, 'enrich', 'failed', { message: err.message });
      await logRunEvent(opts.runId, 'enrich', 'error', err.message);
      logger.error({ err: err.message, rawId }, 'pipeline.enrich.failed');
      result.failedStage = 'enrich';
      result.error = err.message;
      return result;
    }
  }

  // Stage 5: publish
  if (!skip.has('publish') && result.enriched && result.dedupe) {
    await setStageStatus(rawId, 'publish', 'running');
    try {
      // Inject primary_source_url so back-office can show the original listing URL.
      const enrichedWithSource = { ...(result.enriched as Record<string, unknown>), primary_source_url: raw.source_url };
      const p = await publish(rawId, enrichedWithSource as never, result.dedupe, raw.photos);
      await setStageStatus(rawId, 'publish', 'done');
      await logRunEvent(opts.runId, 'publish', 'info', 'publish.done', p);
      result.canonical_listing_id = p.canonical_listing_id;
    } catch (e) {
      const err = e as Error;
      await setStageStatus(rawId, 'publish', 'failed', { message: err.message });
      await logRunEvent(opts.runId, 'publish', 'error', err.message);
      logger.error({ err: err.message, rawId }, 'pipeline.publish.failed');
      result.failedStage = 'publish';
      result.error = err.message;
      return result;
    }
  }

  return result;
}
