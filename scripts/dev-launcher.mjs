#!/usr/bin/env node
/**
 * Local dev launcher — brings up dashboard + worker + wp-sync in one terminal.
 * Each child gets a colored prefix; Ctrl-C kills them all.
 *
 * Usage:
 *   node scripts/dev-launcher.mjs           # start everything
 *   node scripts/dev-launcher.mjs --no-sync # skip wp-sync
 *   node scripts/dev-launcher.mjs --no-worker
 */
import { spawn } from 'node:child_process';

const args = new Set(process.argv.slice(2));

const COLORS = ['\x1b[36m', '\x1b[33m', '\x1b[35m', '\x1b[32m'];
const RESET = '\x1b[0m';

const procs = [];

function start(label, cmd, cmdArgs, color, opts = {}) {
  const child = spawn(cmd, cmdArgs, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '1' },
    ...opts,
  });
  const prefix = `${color}[${label}]${RESET} `;
  child.stdout.on('data', d => process.stdout.write(prefix + d.toString().replace(/\n(?!$)/g, '\n' + prefix)));
  child.stderr.on('data', d => process.stderr.write(prefix + d.toString().replace(/\n(?!$)/g, '\n' + prefix)));
  child.on('exit', code => {
    process.stdout.write(`${prefix}exited with code ${code}\n`);
  });
  procs.push({ label, child });
  return child;
}

console.log('CRDG dev launcher — bringing services up locally');
console.log('Press Ctrl-C to stop everything\n');

start('dashboard', 'npm', ['run', 'dev', '-w', '@crdg/dashboard'], COLORS[0]);

if (!args.has('--no-worker')) {
  // Worker boots cron + queue watcher
  start('worker', 'npm', ['run', 'start', '-w', '@crdg/worker'], COLORS[1]);
}

if (!args.has('--no-sync')) {
  start('wp-sync', 'npm', ['run', 'start', '-w', '@crdg/wp-sync'], COLORS[2]);
}

const shutdown = (sig) => {
  console.log(`\nReceived ${sig}, shutting down...`);
  for (const p of procs) p.child.kill('SIGTERM');
  setTimeout(() => process.exit(0), 2000);
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
