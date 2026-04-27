/**
 * WP-sync entry point. By default runs every 2 minutes; --once for one pass.
 */
import { logger, env } from '@crdg/core';
import cron from 'node-cron';
import { syncPending } from './sync.js';

const args = process.argv.slice(2);
const once = args.includes('--once');

async function main() {
  logger.info({ baseUrl: env.wp.baseUrl, user: env.wp.username, dryRun: env.wp.dryRun }, 'wp-sync.boot');

  if (once) {
    const r = await syncPending();
    logger.info(r, 'wp-sync.once.complete');
    process.exit(0);
  }

  const safeRun = async () => {
    try { await syncPending(); }
    catch (e) { logger.error({ err: (e as Error).message }, 'wp-sync.cycle.failed'); }
  };

  await safeRun(); // initial pass
  cron.schedule('*/2 * * * *', safeRun, { timezone: 'America/Costa_Rica' });
  logger.info('wp-sync.cron.scheduled (every 2 min)');
}

main().catch(e => { logger.error({ err: (e as Error).message }, 'wp-sync.fatal'); process.exit(1); });
