# Morning Briefing — Errol

Welcome back. Here's the shortest path from coffee to seeing what was built.

## TL;DR

Open these in order:

1. **Dashboard** — http://localhost:3000/listings (run `npm run dev` from `~/CRDG_Scraper` if it's not already up). You'll see real Costa Rican listings ingested overnight, with prices, photos, regions, AI tags.
2. **Admin** — http://localhost:3000/admin → KPI tiles, sources, runs, dedup queue, health charts.
3. **Pull request** — https://github.com/Diversified-Business-Management/CRDG_Scraper/pull/1 (the morning review checklist is at the top).
4. **Design doc** — `docs/superpowers/specs/2026-04-27-crdg-listings-pipeline-design.md` (committed to `main`).

## What works today, with no further setup

- **Supabase foundation** — schema applied, 14 tables + 3 views, pgvector, RLS for realtor / admin / anon roles. 47 canonical listings ingested (more arriving from a second pass running now) with photos.
- **Realtor /listings** — search, filter (region / type / price / beds / baths / features), pagination, listing detail.
- **Admin** — sources table with cron + rate-limit + run-now, runs history, dedup queue, AI cost charts.
- **Worker** — orchestrator that runs adapters → AI pipeline → publish, with a file-based "Run now" trigger from the dashboard.
- **WP sync** — Houzez REST mapping, photo download/resize/WebP, batched sync. Currently in dry-run.

## Three things blocking the next steps (you decide)

### 1. WordPress staging Application Password (HTTP 401)
Your app password is rejected on every endpoint. Tried: `errol@myrealtorassistant.com`, the user slug `errolmyrealtorassistant-com`, and `admin`, all over HTTPS. The REST root advertises Application Passwords as the auth method, so the credential itself is the issue. Likely cause: **SiteGround Security plugin** (visible in REST namespaces) is filtering REST auth.

**Fix path:**
- WP Admin → SG Security → Site Security → enable XML-RPC / disable REST API blocking, OR
- Generate a fresh Application Password under your user (Users → Profile → Application Passwords) and paste it back to me, OR
- Switch to the JWT Auth plugin and give me a JWT secret.

When fixed: set `DRY_RUN_WP=false` in `.env` and run `npm run wp-sync -- --once`. ~30 listings will land on staging in a few minutes.

### 2. Voyage AI key (or OpenAI embedding) for real dedupe
Right now dedup is **disabled** because the SHA-256 hash-pseudo-embedding fallback isn't semantically meaningful and produced false merges. Sign up at voyageai.com (free tier is plenty), paste the key as `VOYAGE_API_KEY` in `.env`, and dedup will activate automatically.

### 3. Point2Homes IP allowlist
Cloudflare 403s every request from us, despite contractual permission. Either give me an IP they'll accept, or Point2Homes provides a feed/API instead of website scraping.

## What it cost overnight

- Anthropic spend: under $5 USD (well under the $40/run, $80/day caps in code).
- All on Haiku 4.5 except final description rewrite on Sonnet 4.6.
- No Fly deploy yet (per your "skip Fly for now" instruction).

## How to run locally

```bash
cd ~/CRDG_Scraper

# All services at once (dashboard + worker + wp-sync):
npm run dev

# Or pick one:
npm run dashboard           # http://localhost:3000
npm run worker:once         # one pass over enabled sources
npm run scrape -- --source encuentra24 --max 50   # ad-hoc one source
npm run wp-sync             # cron-loop, every 2 min
```

`.env` (gitignored) is already populated and mirrors `~/crdg-secrets.env`.

## Where to find things

- Design doc: `docs/superpowers/specs/2026-04-27-crdg-listings-pipeline-design.md`
- Schema: `supabase/migrations/20260427000001_initial_schema.sql`
- Adapters: `packages/adapters/src/{encuentra24,mlscr,coldwell-banker-cr,point2homes-cr,developers-generic}.ts`
- AI stages: `packages/ai/src/{extract,normalize,dedupe,enrich,publish}.ts`
- Worker: `apps/worker/src/`
- WP sync: `apps/wp-sync/src/`
- Dashboard: `apps/dashboard/`

## What's stubbed / known limitations

- **Dedupe:** disabled until VOYAGE_API_KEY is set (see #2 above).
- **Hero photo selection:** Anthropic multimodal call returning 400 on some image URLs; falls back to the first scraped photo, which on Coldwell/Encuentra24 is sometimes a header banner. Tunable; not blocking.
- **Saved searches / email alerts:** in design, not built. Phase 2.
- **Realtor magic-link auth:** wired but currently using `NEXT_PUBLIC_DEV_FAKE_AUTH=true` for browseability without configured auth. Flip the env var to false to switch to real Supabase magic links.
- **Mapbox:** map renders the OpenStreetMap fallback iframe unless `NEXT_PUBLIC_MAPBOX_TOKEN` is set.
- **CRDG agents:** seeded one ("Errol Denger") + one "Unassigned". Add the rest via the admin UI or directly in the `agents` table.

## Tests pass

```
packages/core      — type-checks clean
packages/adapters  — 17/17 unit tests pass
packages/ai        — 28/28 unit tests pass
apps/worker        — type-checks clean
apps/wp-sync       — type-checks clean
apps/dashboard     — type-checks clean, builds, dev server boots
```

## Finally

The four phases you asked for last night (foundation → Houzez integration → realtor back-office → admin/health) are all wired and working end-to-end except for the WP write step. Once the auth issue is resolved, this turns into a daily-cron-driven listings catalog with no further code changes needed.

Welcome back. 👋
