/**
 * CLI helper for ad-hoc operations: scrape a single source, list sources, etc.
 */
import { pgQuery, logger } from '@crdg/core';
import { startRun } from './run-state.js';
import { runSource } from './orchestrator.js';
import { resolveAdapter } from './adapter-loader.js';
import { resolvePipeline } from './pipeline-loader.js';

const cmd = process.argv[2];
const args = process.argv.slice(3);

async function main() {
  switch (cmd) {
    case 'scrape': {
      const sourceIdx = args.indexOf('--source');
      const slug = sourceIdx >= 0 ? args[sourceIdx + 1] : null;
      const cap = Number(args[args.indexOf('--max') + 1]) || undefined;
      if (!slug) {
        const sources = await pgQuery<{ slug: string }>('select slug from sources where enabled order by slug');
        for (const s of sources) await runOne(s.slug, cap);
      } else {
        await runOne(slug, cap);
      }
      break;
    }
    case 'list': {
      const rows = await pgQuery<{ slug: string; name: string; enabled: boolean; last_run_at: string | null }>(`
        select s.slug, s.name, s.enabled, sc.last_run_at
        from sources s
        join source_configs sc on sc.source_id = s.id
        order by s.slug
      `);
      console.table(rows);
      break;
    }
    default:
      console.log('Usage: tsx src/cli.ts scrape [--source <slug>] [--max <n>]');
      console.log('       tsx src/cli.ts list');
      process.exit(1);
  }
  process.exit(0);
}

async function runOne(slug: string, cap?: number) {
  const run = await startRun(slug, 'manual');
  try {
    const adapter = await resolveAdapter(slug);
    const pipeline = await resolvePipeline();
    const r = await runSource(adapter, run, { maxListings: cap, pipeline });
    await run.finish('succeeded');
    logger.info({ source: slug, ...r }, 'cli.scrape.done');
  } catch (e) {
    await run.finish('failed', (e as Error).message);
    logger.error({ source: slug, err: (e as Error).message }, 'cli.scrape.failed');
  }
}

main().catch(e => { logger.error(e); process.exit(1); });
