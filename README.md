# CRDG Listings Pipeline

A real-estate listings ingestion platform for Costa Rica Dream Group.

Pulls property listings from authorized sources (Encuentra24, Point2Homes Costa Rica, MLSCR, Coldwell Banker, partner developer sites), normalizes them with AI, stores them in Supabase as the canonical record, and syncs the published view to WordPress (Houzez theme).

## Architecture

```
sources -> worker (Fly) -> Supabase (canonical) -> wp-sync -> Houzez
                              |
                              +--> dashboard (Next.js) -> realtors + admin
                              +--> Claude API access layer
```

See `docs/superpowers/specs/2026-04-27-crdg-listings-pipeline-design.md` for the full design.

## Repo layout

```
apps/
  worker/      Scraper + AI pipeline + cron
  wp-sync/     Houzez sync worker (Supabase -> WordPress)
  dashboard/   Next.js back-office (realtor search + admin/health)
packages/
  core/        Shared types, Supabase client, schema TS types
  adapters/    Per-source scrapers
  ai/          AI pipeline stages
supabase/
  migrations/  SQL migrations (run with `supabase db push`)
infra/
  fly/         Fly.io configuration per app
docs/
  superpowers/specs/  Design docs
```

## Getting started (local dev)

```bash
cp .env.example .env  # fill in real values
npm install
npm run db:push       # apply migrations to Supabase
npm run worker:fixtures  # smoke test against saved HTML fixtures
npm run dashboard:dev    # Next.js back-office at http://localhost:3000
```

## Operational rules

- Anthropic spend cap: $40/run, $80/day (enforced in code)
- Source rate limit: 1 req/sec sustained, burst 3
- WP writes batched 25 at a time with 2s pause
- Photos resized to 1600px max edge, WebP
- All credentials live in `~/crdg-secrets.env` (chmod 600) or Fly secrets — never in git

## Status

This is the initial scaffold built overnight on 2026-04-27. See the open PR for what's working, what's stubbed, and what needs morning approval.
