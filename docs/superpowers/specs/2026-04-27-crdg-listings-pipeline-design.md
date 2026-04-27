# CRDG Listings Pipeline — Design

**Date:** 2026-04-27
**Author:** Claude (with Errol Denger)
**Status:** Approved (architecture); sections 2-7 written autonomously overnight per user authorization for morning review.

## 1. Problem & goals

Costa Rica Dream Group (CRDG) is a real-estate brokerage with 20+ licensed agents across 6 Costa Rican regions. They have just installed the Houzez WordPress theme + plugin on `staging3.costaricadreamgroup.com` but have no listings populated. There is no unified MLS in Costa Rica. CRDG has contractual permissions from four major listing sources (Encuentra24, Point2Homes Costa Rica, MLSCR, and partner brokerages including Coldwell Banker), plus relationships with several developer/project sites. The web teams at these sources are slow and the data quality varies.

**Goals:**

1. **Foundation:** Build a normalized, AI-enriched listings database in Supabase that becomes the canonical record for all CRDG listing data. This database is the foundation for everything else.
2. **Houzez integration:** Sync the published view of those listings into the Houzez `property` custom post type on staging, with photos, agent assignment, and field mapping.
3. **Realtor back-office:** A web app realtors can use to search, filter, view, and (eventually) act on listings in real time. Same database also becomes the read-source for Claude API queries.
4. **System health panel:** Admin UI to configure source sites, set per-source schedules, see run health, AI cost, dedup conflicts, and per-listing trace through the pipeline.

**Non-goals (v1):**

- Buyer-facing search beyond what Houzez provides natively.
- Two-way sync between WP and Supabase. WP is read-only output; Supabase is the source of truth.
- Lead-routing or CRM workflows. (Hooks left for future integration.)
- Replacing Houzez's native search/map/filter UI.
- Production deploy. v1 runs locally; Fly deploy added once stable.

## 2. Architecture overview

```
                    ┌────────────────────────────────────────┐
                    │   Supabase (THE foundation)            │
                    │   ─ canonical_listings (rich schema)   │
                    │   ─ raw_listings + run history         │
                    │   ─ embeddings (pgvector for dedup)    │
                    │   ─ photos, agents, regions            │
                    │   ─ source_configs + schedules         │
                    │   ─ RLS policies                       │
                    └────┬──────────────────────┬────┬───────┘
                         │                      │    │
            ┌────────────┴────┐    ┌────────────┴┐  ┌┴────────────────┐
            │ Worker          │    │ WP Sync     │  │ Claude API      │
            │ scraper + AI    │    │ Houzez REST │  │ access layer    │
            │ + cron (local)  │    │ batched     │  │ REST + future   │
            └────┬────────────┘    └──┬──────────┘  │ MCP server      │
                 │                    │             └─────────────────┘
                 ▼                    ▼
         source sites          Houzez (WP CPT)
                                          ▲
                                          │ public site
                                          │
                                 ┌────────┴────────────────────────┐
                                 │ Next.js back-office app (local) │
                                 │ Phase 3: realtor search/detail  │
                                 │ Phase 4: admin / health panel   │
                                 │ Auth via Supabase, RLS-enforced │
                                 └─────────────────────────────────┘
```

**Tech choices:**

- **Language:** TypeScript everywhere (Node 20 LTS). Strict mode.
- **Monorepo:** npm workspaces (no Turbo/pnpm/Lerna ceremony).
- **Database:** Supabase Postgres (East US / `us-east-1`). pgvector for embeddings. RLS for the back-office.
- **Scraper runtime:** Playwright (Chromium) for sites needing JS, Cheerio for static HTML.
- **AI:** Anthropic SDK. Haiku 4.5 for high-volume work, Sonnet 4.6 only for final description rewrite.
- **Sync:** WP REST API with application-password Basic auth.
- **Dashboard:** Next.js 15 App Router, server components default, Tailwind, shadcn/ui.
- **Scheduling:** `node-cron` inside the worker process. v1 runs locally; Fly later.

**Boundaries (each can fail or pause independently):**

- Scraping is the only thing that touches source sites.
- AI is the only thing that calls Anthropic.
- WP sync is the only thing that talks to WordPress.
- Dashboard reads only from Supabase via supabase-js (RLS enforced).

## 3. Data model

The schema is designed around three layers: **raw → canonical → published**. Raw is what we scraped, canonical is what we normalized + enriched, published is what shipped to Houzez. Every row in `canonical_listings` traces back to one or more rows in `raw_listings` via `dedup_links`.

### 3.1 Tables (abbreviated; full SQL in `supabase/migrations/`)

- **`sources`** — one row per source site. `slug`, `name`, `base_url`, `enabled`, `auth_type`, `auth_payload` (jsonb), `created_at`.
- **`source_configs`** — per-source operational config. `source_id`, `cron_expression`, `rate_limit_rps`, `max_listings_per_run`, `regions` (text[]), `cookies` (jsonb, encrypted at rest), `last_run_at`, `enabled`. One-to-one with `sources` for v1; split for future per-region/per-segment configs.
- **`runs`** — one row per scheduled run, per source. `id`, `source_id`, `started_at`, `ended_at`, `status` (`running`|`succeeded`|`failed`|`partial`|`paused`), `listings_seen`, `listings_new`, `listings_updated`, `cost_usd`, `error` (text), `metadata` (jsonb).
- **`run_logs`** — per-stage events inside a run. `run_id`, `stage`, `level`, `message`, `data` (jsonb), `created_at`.
- **`raw_listings`** — what we pulled from each source. `id`, `source_id`, `source_listing_id` (their ID), `source_url`, `scraped_at`, `raw_html` (text, compressed), `raw_extracted` (jsonb, what the source's own JSON-LD or API gave us), `extract_status`, `normalize_status`, `dedupe_status`, `enrich_status`, `publish_status`, `cost_usd`, `error_jsonb`. Unique constraint `(source_id, source_listing_id)`.
- **`canonical_listings`** — the source of truth. Schema below.
- **`photos`** — `canonical_listing_id`, `url_source`, `url_supabase` (after we cache it), `wp_media_id` (after upload), `width`, `height`, `is_hero`, `position`, `alt_text`, `phash` (perceptual hash for dedup).
- **`dedup_links`** — `canonical_listing_id`, `raw_listing_id`, `confidence` (0-1), `method` (`exact_id`|`address+price`|`embedding`|`human`).
- **`listing_embeddings`** — `canonical_listing_id`, `embedding` (vector(1024)), `model` (`voyage-2`|`text-embedding-3-small`), `text_hash`. Used for dedup search and semantic-similar listings on the back-office.
- **`agents`** — `id`, `email`, `name`, `wp_user_id`, `houzez_agent_id`, `phone`, `regions`, `bio`, `photo_url`, `enabled`. CRDG's 20+ realtors.
- **`regions`** — fixed lookup of CRDG's 6 regions: Central Pacific, Guanacaste, Central Valley, Nicoya, Caribbean, South Pacific. `slug`, `name`, `bbox` (geojson), `parent_region`.
- **`sync_log`** — every WP write. `canonical_listing_id`, `wp_post_id`, `action` (`create`|`update`|`delete`), `status`, `wp_response`, `created_at`. Idempotent: `wp_post_id` becomes the durable link.
- **`alerts`** — `id`, `severity`, `source` (component), `message`, `data`, `acknowledged_at`. Surface in the admin panel.

### 3.2 The `canonical_listings` schema (the foundation)

Designed to be richer than what Houzez needs, so realtors and Claude can use the same record for higher-fidelity work. All fields nullable unless noted.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `slug` | text UNIQUE | url-friendly, generated from title + locality |
| `status` | text | `draft`/`active`/`pending_review`/`sold`/`withdrawn`/`stale` |
| `listing_type` | text | `sale` (v1 sales-only) |
| `property_type` | text | `house`/`condo`/`lot`/`farm`/`commercial`/`hotel`/`other` |
| `title_en` / `title_es` | text | both languages |
| `description_en` / `description_es` | text | AI-rewritten in CRDG voice |
| `description_raw` | text | original, untouched, for audit |
| `price` | numeric(14,2) | |
| `price_currency` | text | `USD`/`CRC` |
| `price_usd` | numeric(14,2) | normalized for sort/filter |
| `price_per_sqm` | numeric(12,2) | derived |
| `bedrooms` | numeric(4,1) | half-beds allowed |
| `bathrooms` | numeric(4,1) | |
| `interior_sqm` | numeric(10,2) | |
| `lot_sqm` | numeric(12,2) | |
| `year_built` | int | |
| `region_slug` | text FK | one of CRDG's 6 |
| `province` | text | Costa Rica province |
| `canton` / `district` / `locality` | text | |
| `address_line` | text | |
| `lat` / `lng` | numeric | |
| `geocode_confidence` | text | `exact`/`block`/`neighborhood`/`region` |
| `features` | text[] | normalized vocabulary: `pool`,`ocean_view`,`gated_community`,`titled`,`turnkey`,... |
| `tags_ai` | text[] | AI-derived classification tags |
| `tags_human` | text[] | overrides set by realtors in dashboard |
| `hoa_fee_usd` | numeric | |
| `taxes_usd_annual` | numeric | |
| `mls_id` | text | if any |
| `agent_id` | uuid FK | CRDG agent assignment |
| `listed_at` | date | |
| `last_seen_at` | timestamptz | last time we saw it on a source — for staleness |
| `confidence` | numeric(3,2) | overall data confidence score |
| `wp_post_id` | int | post ID once synced |
| `wp_synced_at` | timestamptz | |
| `created_at` / `updated_at` | timestamptz | |
| `search_text` | tsvector | generated; en + es |
| `embedding_id` | uuid FK | `listing_embeddings.id` |

### 3.3 RLS model

- **`anon`** role: read-only on `canonical_listings WHERE status='active'`, `photos`, `regions`. (For public APIs / future buyer-facing apps.)
- **`authenticated` realtor role:** read all `canonical_listings` regardless of status, read `agents`, read/write `tags_human` and `agent_id` for listings in their regions. No access to `raw_listings`, `runs`, `source_configs`.
- **`authenticated` admin role:** full read/write on everything.
- **`service_role`:** used only by the worker + sync — bypasses RLS entirely.

### 3.4 Indexes

- GIN on `search_text`, `features`, `tags_ai`, `tags_human`.
- BTree on `region_slug`, `status`, `price_usd`, `bedrooms`, `last_seen_at`.
- HNSW on `listing_embeddings.embedding` for semantic search (pgvector).
- BTree on `raw_listings (source_id, scraped_at DESC)`.

## 4. Source adapters

Each source is a TypeScript module in `packages/adapters/src/<slug>.ts` exporting:

```ts
export interface SourceAdapter {
  slug: string;
  name: string;
  // List page enumeration. May be paginated; yields URLs lazily.
  enumerateListingUrls(opts: EnumerateOpts): AsyncIterable<string>;
  // Fetch a single listing detail page; returns RawListingPayload.
  fetchListing(url: string): Promise<RawListingPayload>;
  // Optional: source-specific cookie/auth flow if needed.
  authenticate?(): Promise<void>;
}
```

`RawListingPayload` carries:
- `source_listing_id` — extracted from URL or page
- `source_url`
- `raw_html` — full page HTML (compressed before insert)
- `raw_extracted` — jsonb of whatever the page already gave us as structured data: JSON-LD, OpenGraph, microdata, embedded JSON blobs
- `photos` — array of `{ url, width?, height?, position }`

The shared pipeline takes care of:
- Rate limiting (per-source `RateLimiter` from `bottleneck`)
- Retry with backoff (3 attempts, exponential)
- Saving to `raw_listings`
- Triggering the AI pipeline

**Sources implemented in v1:**

| Slug | Site | Notes |
|---|---|---|
| `encuentra24` | encuentra24.com (CR real estate sales) | High volume. JSON-LD on detail pages. Pagination URL-driven. |
| `point2homes-cr` | point2homes.com/cr | Static HTML, well-structured. |
| `mlscr` | mls.cr / mlscr.com | Search by region; structured DOM. |
| `coldwell-banker-cr` | coldwellbankercostarica.com | WordPress + IDX. May expose a JSON endpoint. |
| `developers-generic` | configurable per-developer URL | Reads from `source_configs.metadata.developer_urls[]`. |

Adding a 6th, 7th source is one new file + one row in `sources` + one row in `source_configs`. No core changes.

## 5. AI pipeline

Five stages, each idempotent, each writes its result to a column on the `raw_listings` row. Re-runnable per stage without re-scraping.

### Stage 1 — Extract (Haiku 4.5)
Input: `raw_html`, `raw_extracted`. Output: structured JSON conforming to a Zod schema covering every `canonical_listings` field. Prompt explicitly says "do not invent values; null when uncertain." Returns confidence per field.

### Stage 2 — Normalize (deterministic, no AI)
- Currency conversion to USD using a daily-cached exchange rate.
- Unit conversion (sqft → sqm, acres → sqm).
- Region assignment via point-in-polygon against `regions.bbox`, fallback to text match on locality.
- Slug generation, geocoding via Mapbox Geocoding API (free tier).

### Stage 3 — Dedupe (Haiku 4.5 + embeddings)
- Compute embedding from `title + locality + price_usd + interior_sqm + bedrooms`.
- Search HNSW index on `listing_embeddings` for top 5 nearest within source-cross threshold.
- For each candidate, ask Haiku: "Are these the same property? Reason briefly. JSON: {match: bool, confidence: 0-1, reason}."
- If `confidence >= 0.85`: link via `dedup_links`, update existing canonical_listing.
- If `0.6-0.85`: queue for human review, surface in admin panel.
- If `<0.6`: create new canonical_listing.

### Stage 4 — Enrich (Sonnet 4.6 for rewrite, Haiku 4.5 for tags)
- Translate description (Haiku) — both directions: store both `description_en` and `description_es`.
- Rewrite description in CRDG voice (Sonnet) — system prompt holds CRDG's brand voice from the Knowledge Base ("guidance, not just sales", "education first", first-person plural, "we").
- Tag with normalized vocabulary (Haiku) — features and AI tags from a fixed list.
- Pick hero photo + generate alt text (Haiku, multimodal) — picks photo with the best framing/lighting; alt text in EN.

### Stage 5 — Publish
Writes the enriched canonical_listing to Supabase. Marks `wp_synced_at = null` so the WP-sync worker picks it up on its next pass.

### Cost control

`costTracker` middleware tracks every Anthropic call; the run aborts cleanly if `runs.cost_usd >= ANTHROPIC_BUDGET_USD_PER_RUN` (default $40). The cap is per-run; re-running is a fresh budget. A daily cap (default $80) sums across runs.

## 6. WordPress / Houzez sync

`apps/wp-sync` is a separate Node process that reads `canonical_listings WHERE status='active' AND (wp_post_id IS NULL OR updated_at > wp_synced_at)` and pushes each into Houzez.

### Field mapping (canonical → Houzez `property` CPT)

| Canonical | Houzez meta key | Notes |
|---|---|---|
| `title_en` | `post_title` | |
| `description_en` | `post_content` | |
| `slug` | `post_name` | |
| `price` (in USD via `price_usd`) | `fave_property_price` | |
| `price_currency` (forced USD) | `fave_currency` | |
| `bedrooms` | `fave_property_bedrooms` | |
| `bathrooms` | `fave_property_bathrooms` | |
| `interior_sqm` | `fave_property_size` (with `fave_property_size_prefix`=`m²`) | |
| `lot_sqm` | `fave_property_land` | |
| `year_built` | `fave_property_year` | |
| `lat` | `fave_property_map_address` (composed) | |
| `lng` | `fave_property_location` | |
| `address_line`, `locality`, `canton` | composed into `fave_property_map_address` | |
| `region_slug` → `property_city` taxonomy | term assignment | |
| `property_type` → `property_type` taxonomy | term assignment | |
| `features` → `property_feature` taxonomy | term assignment | |
| `agent_id` → Houzez agent CPT | `fave_agents` meta | |
| `photos` (top 12) | uploaded to Media Library, `fave_property_images` meta | |

Sync is **diff-based**: we hash the relevant fields and only push changes. WP writes batched 25 at a time with 2-second pauses to avoid overloading Houzez's hooks. `wp_post_id` is stored back on the canonical row so updates target the same post.

`DRY_RUN_WP=true` in `.env` makes the sync log intended writes without calling WP — useful for development.

## 7. Dashboard (back-office search + admin/health)

Next.js App Router app at `apps/dashboard`. Auth via Supabase Auth (magic link). Two roles: `realtor` and `admin`, encoded in `auth.users.raw_app_meta_data.role`.

### 7.1 Realtor surface (`/listings`)

- **Search:** debounced full-text search over `search_text`, plus filters: region (multi), property_type, price range (USD), bedrooms, bathrooms, features.
- **Map:** Mapbox GL JS clustered map of results.
- **Detail view (`/listings/[slug]`):** all canonical fields, photo gallery, "similar listings" via embedding ANN, source attribution links, edit panel for `tags_human` and `agent_id`.
- **Saved searches:** stored per user. Email-on-new-match deferred to v2.
- **Real-time:** Supabase Realtime channel on `canonical_listings` updates — listings appear in the search UI as the worker enriches them.

### 7.2 Admin / health surface (`/admin`)

- **Sources page:** list of rows from `source_configs`, edit cron, rate limit, regions, max-per-run, enabled/disabled. "Run now" button.
- **Runs page:** chronological list of `runs` with status, listings_seen, cost_usd, errors. Click into per-run trace: every `run_log` event grouped by stage.
- **Listings pipeline page:** funnel of `raw_listings` by stage status (extract/normalize/dedupe/enrich/publish), with click-through to inspect individual listings.
- **Dedup conflicts page:** rows where dedupe confidence is 0.6-0.85, with side-by-side comparison and accept/reject buttons that write to `dedup_links` with `method='human'`.
- **Health panel:** AI cost trend (last 30 days), Anthropic budget remaining, error rate per source, unsynced canonical_listings count, alerts.

### 7.3 Claude API access layer

A small REST endpoint inside the dashboard at `/api/claude/listings` that accepts a Claude tool-use call and returns canonical listing JSON. Deferred MCP server stub at `apps/dashboard/src/mcp/` — design notes only in v1.

## 8. Error handling, observability, testing

- **Errors:** Each adapter wraps fetch in try/catch; on failure, the raw_listing row gets `extract_status='failed'` and an `error_jsonb`. Run continues with the next listing.
- **Auto-pause:** If `error_rate_per_source > 20%` or `5xx_rate > 10%`, the source is marked paused for the rest of the run; an `alerts` row is written.
- **Logging:** structured JSON logs via `pino`, written to `logs/{date}/{source}.jsonl`. The dashboard reads recent logs from `run_logs` (which doubles as a structured audit trail).
- **Tracing:** every `raw_listing` carries the `run_id` that produced it; every `canonical_listing` links back via `dedup_links`.
- **Tests:**
  - Adapters: unit-tested against saved HTML fixtures at `supabase/fixtures/<source>/<n>.html`. Each fixture has an expected `RawListingPayload` JSON snapshot.
  - AI stages: unit-tested with **canned Anthropic responses** (recorded with a small playback layer) so tests don't burn credits.
  - Sync: tested against a recorded WP REST response set; integration test guarded behind `RUN_LIVE_WP_TEST=true`.

## 9. Operational rules (encoded in code as constants in `packages/core/src/limits.ts`)

| Limit | Value | Rationale |
|---|---|---|
| Anthropic spend / run | $40 | Aborts cleanly if exceeded. |
| Anthropic spend / 24h | $80 | Daily safety net across runs. |
| Per-source request rate | 1 rps sustained, 3 burst | Polite even when authorized. |
| Per-source listings / run | 2,000 | Sanity cap; CRDG's whole inventory likely under 4,000 across all sources. |
| Photos / listing | 12 | Hero + 11 gallery. |
| Photo max edge | 1,600px | Re-encoded to WebP, 80% quality. |
| WP write batch | 25 | 2-second pause between batches. |
| WP timeout | 30s/request | |
| Auto-pause source | 5xx > 10% or error > 20% | Within a single run. |

## 10. Build phases & order

- **Phase 1 (v1, this PR):** Schema, all 5 adapters, all 5 AI stages, scheduler, basic dashboard with realtor search + admin sources/runs view, WP sync.
- **Phase 2:** Polish dashboard, add saved searches with email alerts, MCP server for Claude.
- **Phase 3:** Production deploy (Fly), real-time worker (vs nightly cron), analytics dashboard.
- **Phase 4:** Lead-routing + CRM hooks; bidirectional sync of price changes from agent edits in WP back to canonical.

## 11. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Source HTML changes silently break extractor | AI extract stage tolerates missing fields gracefully; fixture tests fail loudly. Per-source `last_successful_extract_at` tracked. |
| Anthropic key gets compromised | Rotated weekly; budget cap is the hard stop regardless of key. |
| WP staging gets flooded with photos | Photos cached in Supabase Storage first; only synced photos are pushed to WP; max 12/listing. |
| Dedup creates false merges | Threshold tuned conservatively (0.85). 0.6-0.85 goes to human review queue. Every dedup writes a `dedup_links` row with `method` so it can be audited and undone. |
| Public GitHub repo leaks credentials | `.gitignore` excludes `.env` and `secrets/`; pre-commit check via `git diff --cached \| grep -E 'sk-ant\|sb_secret'` rejects commits. |
| Realtor sees a listing they shouldn't | RLS on `canonical_listings` keys to `agents.regions` overlap; default-deny on policies. |

## 12. What's NOT in v1

- Buyer-facing search UI on the public site (Houzez handles that).
- Bidirectional sync from WP edits back to Supabase.
- Lead-routing emails/SMS.
- MCP server (stub only).
- Production Fly deploy.
- Analytics beyond the admin health panel.
- Saved-search email alerts.

---

**Approval status:**
- Architecture, sources, AI scope, refresh cadence, runtime location: **approved interactively**.
- Sections 3-12: written autonomously per user authorization for overnight build; subject to morning review.
