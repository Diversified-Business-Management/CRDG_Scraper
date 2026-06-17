/**
 * Lightweight state tracker for an in-flight scrape run.
 * Persists incrementally to runs + run_logs.
 */
import { pgQuery, logger } from '@crdg/core';

export interface RunHandle {
  id: string;
  sourceId: string;
  sourceSlug: string;
  startedAt: Date;
  log: (stage: string, level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: unknown) => Promise<void>;
  bumpSeen: (n?: number) => void;
  bumpNew: (n?: number) => void;
  bumpUpdated: (n?: number) => void;
  bumpFailed: (n?: number) => void;
  addCost: (usd: number) => void;
  finish: (status: 'succeeded' | 'failed' | 'partial' | 'paused', error?: string) => Promise<void>;
}

export async function startRun(sourceSlug: string, trigger: 'cron' | 'manual' | 'api' = 'cron'): Promise<RunHandle> {
  const sourceRows = await pgQuery<{ id: string; slug: string; name: string }>(
    'select id, slug, name from sources where slug = $1', [sourceSlug]
  );
  if (sourceRows.length === 0) throw new Error(`Unknown source: ${sourceSlug}`);
  const source = sourceRows[0]!;

  const runRows = await pgQuery<{ id: string }>(
    `insert into runs (source_id, trigger) values ($1, $2) returning id`,
    [source.id, trigger]
  );
  const runId = runRows[0]!.id;
  const startedAt = new Date();

  let listings_seen = 0, listings_new = 0, listings_updated = 0, listings_failed = 0, cost_usd = 0;

  let dirtyTimer: NodeJS.Timeout | null = null;
  const flush = async () => {
    await pgQuery(
      `update runs set listings_seen=$2, listings_new=$3, listings_updated=$4, listings_failed=$5, cost_usd=$6 where id=$1`,
      [runId, listings_seen, listings_new, listings_updated, listings_failed, cost_usd]
    );
  };
  const scheduleFlush = () => {
    if (dirtyTimer) return;
    dirtyTimer = setTimeout(async () => {
      dirtyTimer = null;
      try { await flush(); } catch (e) { logger.warn({ err: (e as Error).message }, 'run.flush_failed'); }
    }, 1500);
  };

  const handle: RunHandle = {
    id: runId,
    sourceId: source.id,
    sourceSlug: source.slug,
    startedAt,
    async log(stage, level, message, data) {
      try {
        await pgQuery(
          `insert into run_logs (run_id, stage, level, message, data) values ($1, $2, $3, $4, $5)`,
          [runId, stage, level, message, data ? JSON.stringify(data) : null]
        );
      } catch (e) {
        logger.warn({ err: (e as Error).message, stage, message }, 'run.log_failed');
      }
      logger[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info']({
        runId, source: source.slug, stage, ...(typeof data === 'object' && data ? data : {}),
      }, message);
    },
    bumpSeen(n = 1) { listings_seen += n; scheduleFlush(); },
    bumpNew(n = 1) { listings_new += n; scheduleFlush(); },
    bumpUpdated(n = 1) { listings_updated += n; scheduleFlush(); },
    bumpFailed(n = 1) { listings_failed += n; scheduleFlush(); },
    addCost(usd) { cost_usd = Number((cost_usd + usd).toFixed(6)); scheduleFlush(); },
    async finish(status, error) {
      if (dirtyTimer) { clearTimeout(dirtyTimer); dirtyTimer = null; }
      await flush();
      await pgQuery(
        `update runs set status=$2, ended_at=now(), error=$3 where id=$1`,
        [runId, status, error ?? null]
      );
      await pgQuery(`update source_configs set last_run_at=now() where source_id=$1`, [source.id]);
    },
  };

  await handle.log('orchestrator', 'info', `Run started for ${source.slug}`, { trigger });
  return handle;
}
