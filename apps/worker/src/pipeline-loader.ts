/**
 * Lazy loader for the AI pipeline. Wraps the @crdg/ai package's runPipeline
 * into the PipelineFns shape the orchestrator expects.
 *
 * If @crdg/ai is not yet built / exports a different surface, falls back
 * to a minimal stub that logs the listing and returns 0 cost — the worker
 * still ingests raw_listings.
 */
import { logger, pgQuery } from '@crdg/core';
import type { RawListingPayload } from '@crdg/core';
import type { PipelineFns } from './orchestrator.js';
import type { RunHandle } from './run-state.js';

export async function resolvePipeline(): Promise<PipelineFns> {
  try {
    const mod = (await import('@crdg/ai')) as unknown as {
      runPipeline?: (rawId: string, raw: RawListingPayload, runId?: string) => Promise<{ costUsd?: number } | number>;
    };
    if (typeof mod.runPipeline === 'function') {
      return {
        async runAll(rawId, raw, run: RunHandle) {
          const out = await mod.runPipeline!(rawId, raw, run.id);
          if (typeof out === 'number') return out;
          return out?.costUsd ?? 0;
        },
      };
    }
  } catch (e) {
    logger.warn({ err: (e as Error).message }, 'pipeline.resolve_fallback');
  }
  // Fallback: mark stages as skipped so the dashboard doesn't show them as pending forever.
  return {
    async runAll(rawId) {
      await pgQuery(
        `update raw_listings set extract_status='skipped', normalize_status='skipped', dedupe_status='skipped', enrich_status='skipped', publish_status='skipped' where id=$1`,
        [rawId],
      );
      return 0;
    },
  };
}
