-- 95-field expansion: align CRDG canonical with RESO MLS + Houzez + CR-specific signals
-- See chat 2026-04-28 for the full mapping table.

-- ============================================================
-- canonical_listings — additive columns (no destructive changes)
-- ============================================================

alter table canonical_listings

  -- Identity / status
  add column if not exists mls_status text,                      -- active|pending|sold|withdrawn|expired

  -- Pricing
  add column if not exists list_price_original_usd numeric(14,2),
  add column if not exists previous_list_price_usd numeric(14,2),
  add column if not exists price_history jsonb default '[]'::jsonb,
  add column if not exists sold_price_usd numeric(14,2),
  add column if not exists hoa_fee_frequency text,               -- monthly|quarterly|annually
  add column if not exists hoa_amenities text[] default '{}',
  add column if not exists hoa_name text,
  add column if not exists tax_year int,
  add column if not exists luxury_tax_yn boolean,
  add column if not exists estimated_closing_usd numeric(10,2),
  add column if not exists rental_income_potential text,         -- low|moderate|high|turnkey_str

  -- Bath detail (RESO style)
  add column if not exists bathrooms_full numeric(4,1),
  add column if not exists bathrooms_half numeric(4,1),

  -- Construction
  add column if not exists year_renovated int,
  add column if not exists stories_total numeric(3,1),
  add column if not exists floor_number int,
  add column if not exists total_floors_in_bldg int,
  add column if not exists construction_status text,             -- existing|under_construction|pre_construction
  add column if not exists condition text,                       -- new|turnkey|move_in|needs_work|fixer|restored
  add column if not exists architectural_style text,             -- spanish_colonial|modern|traditional|contemporary|tropical|...

  -- Parking
  add column if not exists parking_spaces int,
  add column if not exists garage_spaces int,
  add column if not exists parking_features text[] default '{}', -- covered|uncovered|garage|carport|street

  -- Pool / view / waterfront
  add column if not exists pool_features text[] default '{}',    -- private|communal|heated|infinity|saltwater|jacuzzi|none
  add column if not exists view_types text[] default '{}',       -- ocean|mountain|jungle|city|valley|river|none
  add column if not exists waterfront_yn boolean,
  add column if not exists waterfront_features text[] default '{}',
  add column if not exists beachfront_yn boolean,

  -- Amenities / interior
  add column if not exists interior_features text[] default '{}',
  add column if not exists exterior_features text[] default '{}',
  add column if not exists appliances text[] default '{}',
  add column if not exists flooring text[] default '{}',
  add column if not exists cooling text[] default '{}',
  add column if not exists heating text[] default '{}',
  add column if not exists furnishings_included text,            -- fully|partially|unfurnished|negotiable

  -- Costa Rica-specific legal & utilities
  add column if not exists title_status text,                    -- titled|concession|unclear
  add column if not exists maritime_zone boolean,                -- within 200m of high tide → concession-only
  add column if not exists foreigner_buyable boolean,
  add column if not exists road_access text,                     -- paved|gravel|dirt|4x4_only|private
  add column if not exists water_source text,                    -- municipal|private_well|community|spring|unknown
  add column if not exists electricity text,                     -- ICE|private_grid|solar_only|hybrid_solar
  add column if not exists internet_quality text,                -- fiber|cable|dsl|satellite|none
  add column if not exists zoning text,                          -- residential|mixed|commercial|agricultural|tourism

  -- Location detail
  add column if not exists postal_code text,
  add column if not exists country text default 'CR',
  add column if not exists community_name text,                  -- Reserva Conchal, Hacienda Pinilla, etc
  add column if not exists building_name text,                   -- for condos
  add column if not exists gated_community boolean,

  -- Distances (your explicit ask)
  add column if not exists distance_to_beach_km numeric(6,1),
  add column if not exists distance_to_airport_km numeric(6,1),
  add column if not exists nearest_airport_code text,            -- SJO|LIR|XQP|TMU|GLF|NOB|DRK|FON
  add column if not exists distance_to_hospital_km numeric(6,1),
  add column if not exists nearest_hospital_name text,
  add column if not exists distance_to_school_km numeric(6,1),
  add column if not exists nearest_school_name text,
  add column if not exists distance_to_grocery_km numeric(6,1),
  add column if not exists school_district text,
  add column if not exists elementary_school text,
  add column if not exists secondary_school text,

  -- Lifecycle
  add column if not exists days_on_market int,
  add column if not exists under_contract boolean default false,
  add column if not exists sold_at date,

  -- Agent / brokerage attribution (back office)
  add column if not exists listing_agent_name text,
  add column if not exists listing_agent_phone text,
  add column if not exists listing_agent_email text,
  add column if not exists source_brokerage text,
  add column if not exists source_brokerage_phone text,
  add column if not exists primary_source_url text,
  add column if not exists all_source_urls jsonb default '[]'::jsonb,

  -- Media
  add column if not exists photo_count int,
  add column if not exists virtual_tour_url text,
  add column if not exists video_url text,
  add column if not exists floorplan_url text,
  add column if not exists floorplans jsonb default '[]'::jsonb, -- [{url, label, sqm, beds, baths}]

  -- CRDG-internal: catch-all + review
  add column if not exists notes text,                           -- AI catch-all + realtor free text
  add column if not exists extra_data jsonb default '{}'::jsonb, -- AI dumps unmapped fields here
  add column if not exists realtor_review_status text default 'unreviewed', -- unreviewed|reviewed|flagged|featured
  add column if not exists realtor_review_notes text,
  add column if not exists internal_quality_score numeric(3,2);

-- Generated bathrooms_total = bathrooms_full + bathrooms_half/2 (when populated)
alter table canonical_listings
  drop column if exists bathrooms_total;
alter table canonical_listings
  add column bathrooms_total numeric(4,1)
    generated always as (
      coalesce(bathrooms_full, 0) + coalesce(bathrooms_half, 0) * 0.5
    ) stored;

-- Useful indexes for the new fields people will actually filter on
create index if not exists canonical_listings_listing_agent_email_idx on canonical_listings (listing_agent_email) where listing_agent_email is not null;
create index if not exists canonical_listings_community_idx on canonical_listings (community_name) where community_name is not null;
create index if not exists canonical_listings_view_types_idx on canonical_listings using gin (view_types);
create index if not exists canonical_listings_pool_features_idx on canonical_listings using gin (pool_features);
create index if not exists canonical_listings_distance_beach_idx on canonical_listings (distance_to_beach_km) where distance_to_beach_km is not null;
create index if not exists canonical_listings_review_idx on canonical_listings (realtor_review_status) where realtor_review_status != 'unreviewed';

-- ============================================================
-- photos table — quality control columns
-- ============================================================

alter table photos
  add column if not exists photo_type text,                      -- listing|aerial|floorplan|community|view|interior|bathroom|kitchen|bedroom|exterior|reject
  add column if not exists reject_reason text,                   -- icon|logo|footer|sprite|banner|watermark|duplicate|tiny|low_quality|unrelated
  add column if not exists is_rejected boolean default false,
  add column if not exists ai_validated boolean default false,
  add column if not exists ai_validation_notes text;

create index if not exists photos_active_idx on photos (canonical_listing_id, position) where is_rejected = false;
create index if not exists photos_rejected_idx on photos (reject_reason) where is_rejected = true;

-- ============================================================
-- Reference tables for distance computation
-- ============================================================

create table if not exists cr_airports (
  code text primary key,        -- SJO|LIR|XQP|TMU|GLF|NOB|DRK|FON|TNO|PJM|...
  name text not null,
  iata text,                    -- IATA code if international
  type text not null,           -- international|domestic|private
  lat numeric(9,6) not null,
  lng numeric(9,6) not null,
  region_slug text references regions(slug)
);

create table if not exists cr_hospitals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null,           -- public_hospital|private_hospital|clinic|emergency
  lat numeric(9,6) not null,
  lng numeric(9,6) not null,
  region_slug text references regions(slug)
);

create table if not exists cr_schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  level text not null,          -- elementary|secondary|university|international
  language text,                -- spanish|english|bilingual|french|german
  lat numeric(9,6) not null,
  lng numeric(9,6) not null,
  region_slug text references regions(slug)
);

create table if not exists cr_beaches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  lat numeric(9,6) not null,
  lng numeric(9,6) not null,
  region_slug text references regions(slug)
);

-- Seed a starter set — can be expanded by the realtor team later.
insert into cr_airports (code, name, iata, type, lat, lng, region_slug) values
  ('SJO', 'Juan Santamaría International Airport', 'SJO', 'international', 9.99386, -84.20882, 'central-valley'),
  ('LIR', 'Daniel Oduber International Airport', 'LIR', 'international', 10.59308, -85.54442, 'guanacaste'),
  ('XQP', 'Quepos La Managua Airport', 'XQP', 'domestic', 9.44319, -84.12972, 'central-pacific'),
  ('TMU', 'Tambor Airport', 'TMU', 'domestic', 9.73852, -85.01388, 'nicoya'),
  ('GLF', 'Golfito Airport', 'GLF', 'domestic', 8.65370, -83.18219, 'south-pacific'),
  ('NOB', 'Nosara Airport', 'NOB', 'domestic', 9.97651, -85.65300, 'nicoya'),
  ('DRK', 'Drake Bay Airport', 'DRK', 'domestic', 8.71890, -83.64178, 'south-pacific'),
  ('FON', 'La Fortuna / Arenal Airport', 'FON', 'domestic', 10.47813, -84.63380, 'central-valley'),
  ('TNO', 'Tamarindo Airport', 'TNO', 'domestic', 10.31350, -85.81545, 'guanacaste'),
  ('PJM', 'Puerto Jiménez Airport', 'PJM', 'domestic', 8.53314, -83.30000, 'south-pacific')
on conflict (code) do nothing;

insert into cr_hospitals (name, type, lat, lng, region_slug) values
  ('Hospital CIMA San José', 'private_hospital', 9.92814, -84.13222, 'central-valley'),
  ('Hospital Clínica Bíblica', 'private_hospital', 9.92798, -84.08200, 'central-valley'),
  ('Hospital Metropolitano', 'private_hospital', 9.94583, -84.12278, 'central-valley'),
  ('Hospital San Rafael (Liberia)', 'public_hospital', 10.63167, -85.43444, 'guanacaste'),
  ('CIMA Liberia / La Pacífica', 'private_hospital', 10.62500, -85.45000, 'guanacaste'),
  ('Hospital Monseñor Sanabria', 'public_hospital', 9.97670, -84.83330, 'central-pacific'),
  ('Hospital Tony Facio', 'public_hospital', 9.99000, -83.03200, 'caribbean'),
  ('Hospital Escalante Pradilla', 'public_hospital', 9.37500, -83.70000, 'south-pacific'),
  ('Hospital Calderón Guardia', 'public_hospital', 9.93414, -84.07140, 'central-valley'),
  ('Hospital México', 'public_hospital', 9.96770, -84.13380, 'central-valley'),
  ('Hospital San Juan de Dios', 'public_hospital', 9.93330, -84.08330, 'central-valley')
on conflict do nothing;

insert into cr_schools (name, level, language, lat, lng, region_slug) values
  ('Country Day School', 'international', 'bilingual', 9.95860, -84.14930, 'central-valley'),
  ('Lincoln School', 'international', 'bilingual', 9.97580, -84.10720, 'central-valley'),
  ('European School', 'international', 'bilingual', 9.95620, -84.20050, 'central-valley'),
  ('Costa Rica International Academy (CRIA)', 'international', 'bilingual', 10.55000, -85.69000, 'guanacaste'),
  ('La Paz Community School', 'international', 'bilingual', 10.54500, -85.69900, 'guanacaste'),
  ('Falcon International Academy (Manuel Antonio)', 'international', 'bilingual', 9.39000, -84.16000, 'central-pacific'),
  ('Del Mar Academy (Nosara)', 'international', 'bilingual', 9.97800, -85.64900, 'nicoya'),
  ('Country Day School Guanacaste', 'international', 'bilingual', 10.61580, -85.74200, 'guanacaste')
on conflict do nothing;

insert into cr_beaches (name, lat, lng, region_slug) values
  ('Tamarindo', 10.30000, -85.84167, 'guanacaste'),
  ('Conchal', 10.41028, -85.79500, 'guanacaste'),
  ('Flamingo', 10.43361, -85.78417, 'guanacaste'),
  ('Potrero', 10.43889, -85.77861, 'guanacaste'),
  ('Avellanas', 10.16111, -85.83833, 'guanacaste'),
  ('Nosara / Guiones', 9.97500, -85.65750, 'nicoya'),
  ('Sámara', 9.88556, -85.52972, 'nicoya'),
  ('Santa Teresa / Mal País', 9.64778, -85.16778, 'nicoya'),
  ('Montezuma', 9.65750, -85.07000, 'nicoya'),
  ('Jacó', 9.61667, -84.62917, 'central-pacific'),
  ('Hermosa (Central Pacific)', 9.59056, -84.61500, 'central-pacific'),
  ('Manuel Antonio', 9.38972, -84.15694, 'central-pacific'),
  ('Dominical', 9.25361, -83.85500, 'south-pacific'),
  ('Uvita', 9.16500, -83.74250, 'south-pacific'),
  ('Ojochal', 9.10472, -83.68722, 'south-pacific'),
  ('Pavones', 8.39222, -83.13750, 'south-pacific'),
  ('Puerto Viejo (Caribbean)', 9.65500, -82.75556, 'caribbean'),
  ('Cahuita', 9.73611, -82.84778, 'caribbean'),
  ('Manzanillo (Caribbean)', 9.63333, -82.65750, 'caribbean')
on conflict do nothing;

-- ============================================================
-- View refresh — v_listings_card now exposes more useful fields
-- ============================================================

drop view if exists v_listings_card;
create view v_listings_card as
select
  cl.id, cl.slug, cl.status, cl.title_en, cl.title_es, cl.property_type,
  cl.price_usd, cl.bedrooms, cl.bathrooms, cl.bathrooms_total,
  cl.interior_sqm, cl.lot_sqm, cl.year_built,
  cl.region_slug, cl.locality, cl.canton, cl.province, cl.lat, cl.lng,
  cl.community_name, cl.gated_community,
  cl.tags_ai, cl.tags_human, cl.features, cl.view_types,
  cl.distance_to_beach_km, cl.distance_to_airport_km, cl.nearest_airport_code,
  (select coalesce(p.url_supabase, p.url_source) from photos p
    where p.canonical_listing_id = cl.id and p.is_hero = true and not p.is_rejected limit 1) as hero_url,
  (select coalesce(p.url_supabase, p.url_source) from photos p
    where p.canonical_listing_id = cl.id and not p.is_rejected order by p.position limit 1) as fallback_url,
  cl.last_seen_at,
  cl.wp_post_id,
  cl.realtor_review_status
from canonical_listings cl;
