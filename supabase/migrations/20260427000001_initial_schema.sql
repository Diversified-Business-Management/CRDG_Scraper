-- CRDG Listings Pipeline — initial schema
-- See docs/superpowers/specs/2026-04-27-crdg-listings-pipeline-design.md §3

create extension if not exists "pgcrypto";
create extension if not exists "vector";
create extension if not exists "pg_trgm";

-- ============================================================
-- Lookup tables
-- ============================================================

create table if not exists regions (
  slug text primary key,
  name text not null,
  parent_region text,
  bbox jsonb,
  display_order int default 0
);

insert into regions (slug, name, display_order) values
  ('central-pacific', 'Central Pacific', 10),
  ('guanacaste', 'Guanacaste', 20),
  ('central-valley', 'Central Valley', 30),
  ('nicoya', 'Nicoya Peninsula', 40),
  ('caribbean', 'Caribbean Coast', 50),
  ('south-pacific', 'South Pacific', 60)
on conflict (slug) do nothing;

create table if not exists agents (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  name text not null,
  phone text,
  bio text,
  photo_url text,
  regions text[] default '{}',
  wp_user_id int,
  houzez_agent_id int,
  enabled boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- Sources & operational config
-- ============================================================

create table if not exists sources (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  base_url text not null,
  enabled boolean default true,
  auth_type text default 'none',  -- none | basic | cookie | api_key
  auth_payload jsonb,
  notes text,
  created_at timestamptz default now()
);

insert into sources (slug, name, base_url, notes) values
  ('encuentra24', 'Encuentra24 Costa Rica', 'https://www.encuentra24.com/costa-rica-en/real-estate-for-sale', 'Static + JSON-LD'),
  ('point2homes-cr', 'Point2 Homes Costa Rica', 'https://www.point2homes.com/CR/Real-Estate-Listings.html', 'Static HTML'),
  ('mlscr', 'MLS Costa Rica', 'https://www.mls.cr', 'Search by region'),
  ('coldwell-banker-cr', 'Coldwell Banker Costa Rica', 'https://www.coldwellbankercostarica.com', 'WordPress + IDX'),
  ('developers-generic', 'CRDG Partner Developers', 'https://developers.crdg', 'Configurable per-developer URLs')
on conflict (slug) do nothing;

create table if not exists source_configs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references sources(id) on delete cascade,
  cron_expression text not null default '0 2 * * *',  -- 2am daily
  rate_limit_rps numeric(5,2) default 1.0,
  burst int default 3,
  max_listings_per_run int default 2000,
  regions text[] default '{}',
  cookies jsonb,
  metadata jsonb default '{}'::jsonb,
  last_run_at timestamptz,
  enabled boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (source_id)
);

-- Seed default config for each source
insert into source_configs (source_id, regions)
select s.id, array['central-pacific','guanacaste','central-valley','nicoya','caribbean','south-pacific']
from sources s
on conflict (source_id) do nothing;

-- ============================================================
-- Run history & logging
-- ============================================================

create table if not exists runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references sources(id) on delete cascade,
  trigger text not null default 'cron',  -- cron | manual | api
  status text not null default 'running', -- running | succeeded | failed | partial | paused
  started_at timestamptz default now(),
  ended_at timestamptz,
  listings_seen int default 0,
  listings_new int default 0,
  listings_updated int default 0,
  listings_failed int default 0,
  cost_usd numeric(10,4) default 0,
  error text,
  metadata jsonb default '{}'::jsonb
);

create index if not exists runs_source_started_idx on runs (source_id, started_at desc);
create index if not exists runs_status_idx on runs (status) where status in ('running','failed','paused');

create table if not exists run_logs (
  id bigserial primary key,
  run_id uuid not null references runs(id) on delete cascade,
  stage text not null,  -- enumerate | fetch | extract | normalize | dedupe | enrich | publish | sync
  level text not null default 'info', -- debug | info | warn | error
  message text not null,
  data jsonb,
  created_at timestamptz default now()
);

create index if not exists run_logs_run_idx on run_logs (run_id, created_at);
create index if not exists run_logs_level_idx on run_logs (level) where level in ('warn','error');

-- ============================================================
-- Raw listings (source-of-truth for what we scraped)
-- ============================================================

create table if not exists raw_listings (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references sources(id) on delete cascade,
  source_listing_id text not null,
  source_url text not null,
  run_id uuid references runs(id) on delete set null,
  scraped_at timestamptz default now(),
  raw_html text,
  raw_extracted jsonb,
  photos jsonb default '[]'::jsonb,
  -- Stage status flags
  extract_status text default 'pending',   -- pending | running | done | failed | skipped
  normalize_status text default 'pending',
  dedupe_status text default 'pending',
  enrich_status text default 'pending',
  publish_status text default 'pending',
  -- Per-stage outputs
  extracted jsonb,
  normalized jsonb,
  dedupe_result jsonb,
  enriched jsonb,
  -- Cost & error tracking
  cost_usd numeric(10,4) default 0,
  error_jsonb jsonb,
  unique (source_id, source_listing_id)
);

create index if not exists raw_listings_source_scraped_idx on raw_listings (source_id, scraped_at desc);
create index if not exists raw_listings_publish_status_idx on raw_listings (publish_status) where publish_status = 'pending';
create index if not exists raw_listings_extract_status_idx on raw_listings (extract_status);

-- ============================================================
-- Canonical listings (the foundation)
-- ============================================================

create table if not exists canonical_listings (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  status text not null default 'active',  -- draft | active | pending_review | sold | withdrawn | stale
  listing_type text not null default 'sale',
  property_type text,  -- house | condo | lot | farm | commercial | hotel | other

  -- Titles & descriptions
  title_en text,
  title_es text,
  description_en text,
  description_es text,
  description_raw text,

  -- Price
  price numeric(14,2),
  price_currency text default 'USD',
  price_usd numeric(14,2),
  price_per_sqm numeric(12,2),

  -- Dimensions
  bedrooms numeric(4,1),
  bathrooms numeric(4,1),
  interior_sqm numeric(10,2),
  lot_sqm numeric(12,2),
  year_built int,

  -- Location
  region_slug text references regions(slug),
  province text,
  canton text,
  district text,
  locality text,
  address_line text,
  lat numeric(9,6),
  lng numeric(9,6),
  geocode_confidence text, -- exact | block | neighborhood | region

  -- Tags & features
  features text[] default '{}',
  tags_ai text[] default '{}',
  tags_human text[] default '{}',

  -- Financial
  hoa_fee_usd numeric(10,2),
  taxes_usd_annual numeric(10,2),

  -- IDs & relationships
  mls_id text,
  agent_id uuid references agents(id) on delete set null,

  -- Lifecycle
  listed_at date,
  last_seen_at timestamptz default now(),
  confidence numeric(3,2) default 0.5,

  -- WordPress
  wp_post_id int,
  wp_synced_at timestamptz,
  wp_content_hash text,  -- for diff-based sync

  -- Search
  search_text tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(title_en,'')), 'A') ||
    setweight(to_tsvector('simple', coalesce(title_es,'')), 'A') ||
    setweight(to_tsvector('simple', coalesce(locality,'')), 'B') ||
    setweight(to_tsvector('simple', coalesce(canton,'')), 'B') ||
    setweight(to_tsvector('simple', coalesce(province,'')), 'C') ||
    setweight(to_tsvector('simple', coalesce(description_en,'')), 'D')
  ) stored,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists canonical_listings_search_idx on canonical_listings using gin (search_text);
create index if not exists canonical_listings_features_idx on canonical_listings using gin (features);
create index if not exists canonical_listings_tags_ai_idx on canonical_listings using gin (tags_ai);
create index if not exists canonical_listings_tags_human_idx on canonical_listings using gin (tags_human);
create index if not exists canonical_listings_region_idx on canonical_listings (region_slug);
create index if not exists canonical_listings_status_idx on canonical_listings (status) where status = 'active';
create index if not exists canonical_listings_price_idx on canonical_listings (price_usd) where status = 'active';
create index if not exists canonical_listings_bedrooms_idx on canonical_listings (bedrooms) where status = 'active';
create index if not exists canonical_listings_last_seen_idx on canonical_listings (last_seen_at desc);
create index if not exists canonical_listings_wp_pending_idx on canonical_listings (wp_synced_at)
  where wp_synced_at is null or updated_at > wp_synced_at;

-- ============================================================
-- Photos
-- ============================================================

create table if not exists photos (
  id uuid primary key default gen_random_uuid(),
  canonical_listing_id uuid not null references canonical_listings(id) on delete cascade,
  url_source text not null,
  url_supabase text,
  storage_path text,
  wp_media_id int,
  width int,
  height int,
  byte_size int,
  mime_type text default 'image/webp',
  is_hero boolean default false,
  position int default 0,
  alt_text_en text,
  alt_text_es text,
  phash text,  -- perceptual hash for cross-source photo dedup
  status text default 'pending',  -- pending | downloaded | uploaded_wp | failed
  created_at timestamptz default now()
);

create index if not exists photos_listing_idx on photos (canonical_listing_id, position);
create index if not exists photos_phash_idx on photos (phash) where phash is not null;

-- ============================================================
-- Dedup
-- ============================================================

create table if not exists dedup_links (
  id uuid primary key default gen_random_uuid(),
  canonical_listing_id uuid not null references canonical_listings(id) on delete cascade,
  raw_listing_id uuid not null references raw_listings(id) on delete cascade,
  confidence numeric(3,2) not null,
  method text not null,  -- exact_id | address_price | embedding | human
  reason text,
  reviewed_by uuid references agents(id),
  reviewed_at timestamptz,
  created_at timestamptz default now(),
  unique (canonical_listing_id, raw_listing_id)
);

create index if not exists dedup_links_canonical_idx on dedup_links (canonical_listing_id);
create index if not exists dedup_links_raw_idx on dedup_links (raw_listing_id);
create index if not exists dedup_links_review_queue_idx on dedup_links (confidence)
  where reviewed_at is null and confidence between 0.6 and 0.85;

-- ============================================================
-- Embeddings (for dedup + semantic search)
-- ============================================================

create table if not exists listing_embeddings (
  id uuid primary key default gen_random_uuid(),
  canonical_listing_id uuid not null references canonical_listings(id) on delete cascade,
  embedding vector(1024) not null,
  model text not null,
  text_hash text not null,
  created_at timestamptz default now(),
  unique (canonical_listing_id, model)
);

create index if not exists listing_embeddings_hnsw on listing_embeddings using hnsw (embedding vector_cosine_ops);

-- ============================================================
-- WP sync log
-- ============================================================

create table if not exists sync_log (
  id bigserial primary key,
  canonical_listing_id uuid not null references canonical_listings(id) on delete cascade,
  wp_post_id int,
  action text not null,  -- create | update | delete | skip
  status text not null,  -- success | failed | dry_run
  http_status int,
  wp_response jsonb,
  error text,
  duration_ms int,
  created_at timestamptz default now()
);

create index if not exists sync_log_listing_idx on sync_log (canonical_listing_id, created_at desc);
create index if not exists sync_log_status_idx on sync_log (status, created_at desc);

-- ============================================================
-- Alerts
-- ============================================================

create table if not exists alerts (
  id uuid primary key default gen_random_uuid(),
  severity text not null default 'info',  -- info | warn | error | critical
  source text not null,  -- component identifier (worker | wp-sync | adapter:slug | ...)
  message text not null,
  data jsonb,
  acknowledged_at timestamptz,
  acknowledged_by uuid references agents(id),
  created_at timestamptz default now()
);

create index if not exists alerts_unread_idx on alerts (created_at desc) where acknowledged_at is null;
create index if not exists alerts_severity_idx on alerts (severity, created_at desc);

-- ============================================================
-- Daily AI cost rollup (cheap to query, used by health panel)
-- ============================================================

create table if not exists ai_costs_daily (
  day date primary key,
  cost_usd numeric(10,4) not null default 0,
  haiku_input_tokens bigint default 0,
  haiku_output_tokens bigint default 0,
  sonnet_input_tokens bigint default 0,
  sonnet_output_tokens bigint default 0,
  embedding_tokens bigint default 0,
  call_count int default 0
);

-- ============================================================
-- updated_at triggers
-- ============================================================

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_canonical_listings_updated on canonical_listings;
create trigger trg_canonical_listings_updated
  before update on canonical_listings
  for each row execute function set_updated_at();

drop trigger if exists trg_source_configs_updated on source_configs;
create trigger trg_source_configs_updated
  before update on source_configs
  for each row execute function set_updated_at();

drop trigger if exists trg_agents_updated on agents;
create trigger trg_agents_updated
  before update on agents
  for each row execute function set_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================

alter table canonical_listings enable row level security;
alter table photos enable row level security;
alter table regions enable row level security;
alter table agents enable row level security;
alter table sources enable row level security;
alter table source_configs enable row level security;
alter table runs enable row level security;
alter table run_logs enable row level security;
alter table raw_listings enable row level security;
alter table dedup_links enable row level security;
alter table listing_embeddings enable row level security;
alter table sync_log enable row level security;
alter table alerts enable row level security;
alter table ai_costs_daily enable row level security;

-- service_role bypasses RLS — no policy needed
-- anon: read-only public listings
drop policy if exists "anon_read_active_listings" on canonical_listings;
create policy "anon_read_active_listings" on canonical_listings
  for select to anon
  using (status = 'active');

drop policy if exists "anon_read_photos" on photos;
create policy "anon_read_photos" on photos
  for select to anon
  using (exists (
    select 1 from canonical_listings c
    where c.id = photos.canonical_listing_id and c.status = 'active'
  ));

drop policy if exists "anon_read_regions" on regions;
create policy "anon_read_regions" on regions for select to anon using (true);

-- authenticated: realtors see all listings, can update human tags + agent
drop policy if exists "authenticated_read_all_listings" on canonical_listings;
create policy "authenticated_read_all_listings" on canonical_listings
  for select to authenticated using (true);

drop policy if exists "authenticated_update_listings_human_fields" on canonical_listings;
create policy "authenticated_update_listings_human_fields" on canonical_listings
  for update to authenticated using (true) with check (true);

drop policy if exists "authenticated_read_photos" on photos;
create policy "authenticated_read_photos" on photos for select to authenticated using (true);

drop policy if exists "authenticated_read_agents" on agents;
create policy "authenticated_read_agents" on agents for select to authenticated using (true);

drop policy if exists "authenticated_read_regions" on regions;
create policy "authenticated_read_regions" on regions for select to authenticated using (true);

-- Admin role (set in JWT app_metadata.role='admin') gets full read on operational tables
drop policy if exists "admin_full_runs" on runs;
create policy "admin_full_runs" on runs for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "admin_full_run_logs" on run_logs;
create policy "admin_full_run_logs" on run_logs for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "admin_full_sources" on sources;
create policy "admin_full_sources" on sources for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "admin_full_source_configs" on source_configs;
create policy "admin_full_source_configs" on source_configs for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "admin_full_raw_listings" on raw_listings;
create policy "admin_full_raw_listings" on raw_listings for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "admin_full_alerts" on alerts;
create policy "admin_full_alerts" on alerts for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "admin_read_sync_log" on sync_log;
create policy "admin_read_sync_log" on sync_log for select to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "admin_read_dedup_links" on dedup_links;
create policy "admin_read_dedup_links" on dedup_links for select to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "admin_full_embeddings" on listing_embeddings;
create policy "admin_full_embeddings" on listing_embeddings for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "admin_read_ai_costs" on ai_costs_daily;
create policy "admin_read_ai_costs" on ai_costs_daily for select to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ============================================================
-- Helpful views
-- ============================================================

create or replace view v_pipeline_funnel as
select
  s.slug as source_slug,
  s.name as source_name,
  count(*) filter (where extract_status = 'done') as extracted,
  count(*) filter (where normalize_status = 'done') as normalized,
  count(*) filter (where dedupe_status = 'done') as deduped,
  count(*) filter (where enrich_status = 'done') as enriched,
  count(*) filter (where publish_status = 'done') as published,
  count(*) filter (where extract_status = 'failed' or normalize_status='failed' or enrich_status='failed') as failed,
  count(*) as total
from raw_listings r
join sources s on s.id = r.source_id
group by s.slug, s.name;

create or replace view v_recent_runs as
select
  r.id, r.source_id, s.slug as source_slug, s.name as source_name,
  r.trigger, r.status, r.started_at, r.ended_at,
  r.listings_seen, r.listings_new, r.listings_updated, r.listings_failed,
  r.cost_usd, r.error,
  extract(epoch from (coalesce(r.ended_at, now()) - r.started_at))::int as duration_seconds
from runs r
join sources s on s.id = r.source_id
order by r.started_at desc;

create or replace view v_listings_card as
select
  c.id, c.slug, c.status, c.title_en, c.title_es, c.property_type,
  c.price_usd, c.bedrooms, c.bathrooms, c.interior_sqm, c.lot_sqm,
  c.region_slug, c.locality, c.canton, c.lat, c.lng,
  c.tags_ai, c.tags_human, c.features,
  (select url_supabase from photos p where p.canonical_listing_id = c.id and p.is_hero = true limit 1) as hero_url,
  (select url_supabase from photos p where p.canonical_listing_id = c.id order by p.position limit 1) as fallback_url,
  c.last_seen_at,
  c.wp_post_id
from canonical_listings c;
