/**
 * Main worker entrypoint. Boots scheduler from source_configs and (optionally) runs once on start.
 *
 * Usage:
 *   tsx src/main.ts            # start cron scheduler
 *   tsx src/main.ts --once     # run all enabled sources once and exit
 *   tsx src/main.ts --source encuentra24  # run specific source once and exit
 */
import { logger, env, pgQuery } from '@crdg/core';
import cron from 'node-cron';
import { startRun } from './run-state.js';
import { runSource } from './orchestrator.js';
import { resolveAdapter } from './adapter-loader.js';
import { resolvePipeline } from './pipeline-loader.js';

interface CliArgs { once: boolean; sourceSlug: string | null; }

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const once = argv.includes('--once');
  const sourceIdx = argv.indexOf('--source');
  const sourceSlug = sourceIdx >= 0 && argv[sourceIdx + 1] ? argv[sourceIdx + 1]! : null;
  return { once: once || sourceSlug !== null, sourceSlug };
}

async function getEnabledSources(): Promise<{ slug: string; cron: string }[]> {
  return pgQuery<{ slug: string; cron: string }>(`
    select s.slug, sc.cron_expression as cron
    from sources s
    join source_configs sc on sc.source_id = s.id
    where s.enabled = true and sc.enabled = true
    order by s.slug
  `);
}

async function runOnce(slug: string): Promise<void> {
  logger.info({ source: slug }, 'worker.run.start');
  const run = await startRun(slug, 'manual');
  try {
    const adapter = await resolveAdapter(slug);
    const pipeline = await resolvePipeline();
    const result = await runSource(adapter, run, { pipeline });
    await run.log('orchestrator', 'info', `Run complete`, result);
    await run.finish('succeeded');
    logger.info({ source: slug, ...result }, 'worker.run.done');
  } catch (e) {
    const err = e as Error;
    await run.log('orchestrator', 'error', `Run failed: ${err.message}`, { stack: err.stack });
    await run.finish('failed', err.message);
    throw e;
  }
}

async function main() {
  const args = parseArgs();
  logger.info({
    nodeEnv: env.ops.nodeEnv,
    runLiveScrape: env.ops.runLiveScrape,
    once: args.once,
    sourceSlug: args.sourceSlug,
  }, 'worker.boot');

  if (args.sourceSlug) {
    await runOnce(args.sourceSlug);
    process.exit(0);
  }

  if (args.once) {
    const sources = await getEnabledSources();
    for (const s of sources) {
      try { await runOnce(s.slug); }
      catch (e) { logger.error({ err: (e as Error).message, source: s.slug }, 'worker.run.failed'); }
    }
    process.exit(0);
  }

  // Cron mode
  const sources = await getEnabledSources();
  for (const s of sources) {
    if (!cron.validate(s.cron)) {
      logger.warn({ source: s.slug, cron: s.cron }, 'worker.cron.invalid');
      continue;
    }
    cron.schedule(s.cron, async () => {
      try { await runOnce(s.slug); }
      catch (e) { logger.error({ err: (e as Error).message, source: s.slug }, 'worker.cron.failed'); }
    }, { timezone: 'America/Costa_Rica' });
    logger.info({ source: s.slug, cron: s.cron }, 'worker.cron.scheduled');
  }

  // Manual queue: poll a directory for trigger files
  startQueueWatcher();

  logger.info('worker.ready (Ctrl-C to stop)');
}

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

function startQueueWatcher() {
  const dir = join(homedir(), 'crdg-runs', 'queue');
  fs.mkdir(dir, { recursive: true }).catch(() => {});
  setInterval(async () => {
    let files: string[] = [];
    try { files = await fs.readdir(dir); } catch { return; }
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      const path = join(dir, f);
      try {
        const body = JSON.parse(await fs.readFile(path, 'utf8')) as { source: string };
        await fs.unlink(path);
        if (body.source) {
          logger.info({ source: body.source, file: f }, 'worker.queue.trigger');
          await runOnce(body.source);
        }
      } catch (e) {
        logger.warn({ file: f, err: (e as Error).message }, 'worker.queue.bad_file');
        await fs.rename(path, path + '.bad').catch(() => {});
      }
    }
  }, 5_000);
}

main().catch(e => {
  logger.error({ err: (e as Error).message, stack: (e as Error).stack }, 'worker.fatal');
  process.exit(1);
});
