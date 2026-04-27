import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const candidates = [
  join(process.cwd(), '.env'),
  join(homedir(), 'crdg-secrets.env'),
];
for (const path of candidates) {
  if (existsSync(path)) loadDotenv({ path });
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function optional(name: string, fallback?: string): string | undefined {
  return process.env[name] ?? fallback;
}

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  if (Number.isNaN(n)) throw new Error(`Env var ${name} is not a number: ${v}`);
  return n;
}

function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined) return fallback;
  return v === 'true' || v === '1' || v === 'yes';
}

export const env = {
  supabase: {
    url: required('SUPABASE_URL'),
    anonKey: required('SUPABASE_ANON_KEY'),
    serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
    dbUrl: required('SUPABASE_DB_URL'),
  },
  anthropic: {
    apiKey: required('ANTHROPIC_API_KEY'),
    budgetPerRunUsd: num('ANTHROPIC_BUDGET_USD_PER_RUN', 40),
    budgetPerDayUsd: num('ANTHROPIC_BUDGET_USD_PER_DAY', 80),
  },
  wp: {
    baseUrl: optional('WP_BASE_URL', 'http://staging3.costaricadreamgroup.com')!,
    username: optional('WP_USERNAME', '')!,
    appPassword: optional('WP_APP_PASSWORD', '')!,
    dryRun: bool('DRY_RUN_WP', false),
  },
  ops: {
    nodeEnv: optional('NODE_ENV', 'development')!,
    logLevel: optional('LOG_LEVEL', 'info')!,
    runLiveScrape: bool('RUN_LIVE_SCRAPE', false),
  },
} as const;

// Allow fully relaxed TLS for Supabase pooler self-signed chain in dev
if (env.ops.nodeEnv !== 'production') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}
