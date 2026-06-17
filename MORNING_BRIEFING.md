# Morning Briefing — Errol

You and I (Claude) paused around 03:30 CRT after a long debugging session. **The Supabase + AI + scraper foundation is solid; only the WordPress side needs daylight polish.** This file is your resume guide.

## TL;DR

1. **The dashboard is already running** at http://localhost:3000 — open it. Real listings, real photos, full search and admin.
2. **108 canonical listings** are in Supabase, AI-enriched, dedup-merged via Voyage. ~$3.69 spent overnight.
3. **Houzez staging3 has 58 listings synced** but they look rough (missing prices/beds/baths in cards, no hero photos on most). That's the next thing to fix in daylight — not because the pipeline is broken, but because the Houzez `fave_*` meta plugin loading + photo selection need attention.

## Critical thing we learned at the end

**`costaricadreamgroup.com` (production)** lives in your SiteGround account — but **Houzez is NOT installed there**. The wp-config edit, the JWT plugin install, the mu-plugin upload — they all went to production, where they accomplish nothing because Houzez isn't there.

**`staging3.costaricadreamgroup.com`** is hosted on Google Cloud (NOT in your SiteGround account, IP `35.215.119.89`). Houzez IS installed there. The pipeline has been writing 58 listings to it successfully via JWT REST. But you can't access its file system through SG → can't drop the `register_post_meta` mu-plugin → Houzez `fave_*` fields aren't writable via REST → prices/beds/baths/sqm don't appear on the listings.

## Two paths forward (you decide in daylight)

### Path A — install Houzez on production properly
- Install the Houzez theme + plugin on `costaricadreamgroup.com` (the SG site you control).
- Add the JWT Authentication for WP-API plugin (or rely on the App Password fix once SG Security is configured).
- Drop the `register_post_meta` snippet into the active theme's functions.php.
- Re-target the pipeline (`WP_BASE_URL` in `.env`) to `https://costaricadreamgroup.com`.
- Run `npm run wp-sync -- --once`.
- Pro: full control. Con: it's PROD; QA before publishing.

### Path B — figure out who manages staging3 and get file access there
- DNS `staging3.costaricadreamgroup.com` resolves to a Google Cloud IP. Likely set up by a previous developer/agency.
- Once you have file or admin-plugin-upload access to staging3, drop the `register_post_meta` plugin (file is in `infra/wp-mu-plugin/crdg-houzez-rest-meta.php`) and we resync.
- Pro: doesn't disturb production. Con: depends on finding whoever manages it.

## Where you can play right now (no auth blockers)

```
cd ~/CRDG_Scraper
npm run dashboard           # http://localhost:3000 — already running
```

- **`/listings`** — 108 real Costa Rica listings, search by region/type/price/beds/features
- **`/listings/[slug]`** — full detail, photo gallery, features, AI tags, source attribution
- **`/admin`** — KPI tiles
- **`/admin/sources`** — 5 sources, last_run_at, cron, rate limits
- **`/admin/runs`** — every overnight run with stats
- **`/admin/health`** — AI cost charts, alerts, pipeline funnel

## What's perfect (don't redo)
- Supabase schema + RLS
- Voyage embeddings (12 cross-source merges detected)
- AI pipeline (extract / normalize / dedupe / enrich / publish)
- Worker scheduler + CLI
- Dashboard front-end

## What needs daylight attention
- Pick a target Houzez install (Path A or B above)
- Photo hero selection — currently grabs the first scraped image, which on Encuentra24 is often a footer banner. Easy fix: the AI multimodal "pick best photo" stage works on Sonnet 4.6; we have it but it's been failing on base64-encode for some image formats. Tune.
- Title HTML-entity decoding (`&#8211;` → `–`). Trivial.
- English-first title preference where both EN and ES exist. Trivial.
- Point2Homes Cloudflare 403 (separate convo with P2H about IP allowlist).

## Resume in any new terminal

```
cd ~/CRDG_Scraper
git status                  # confirm clean working tree on feat/initial-pipeline
git pull                    # in case you committed anything from another machine
cat MORNING_BRIEFING.md     # this file
npm run dashboard           # http://localhost:3000 if it's not still up
```

Talk to Claude in any new session and reference this file — `~/.claude/projects/-Users-erroldenger/memory/crdg_project.md` already records the project context, so a fresh Claude will know where to pick up.

## Not a bad night
You went from "I just installed Houzez" to a 108-listing AI-enriched ingestion platform with dedup, RLS, a back-office dashboard, and a working WP REST sync — for under $4 in API spend. The horrible-looking listings are a 30-minute meta-plugin fix and 30 minutes of photo/title polish. **That's tomorrow.**

Sleep well. 👋
