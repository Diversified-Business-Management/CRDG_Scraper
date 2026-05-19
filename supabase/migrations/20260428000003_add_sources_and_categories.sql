-- Adds 10 new authorized sources + 5 listing categories per user request

-- ============================================================
-- New sources
-- ============================================================
insert into sources (slug, name, base_url, notes) values
  ('realtor-com-cr', 'Realtor.com International — Costa Rica', 'https://www.realtor.com/international/cr/', 'JS-rendered list; ListingId in URLs'),
  ('re-cr', 'RE/MAX Costa Rica', 'https://www.re.cr/en/costa-rica-real-estate', 'WordPress + IDX'),
  ('coldwell-cb-tamarindo', 'Coldwell Banker Tamarindo', 'https://www.coldwellbankertamarindo.com/property-for-sale', 'Coldwell franchise — separate from main CR site'),
  ('properties-in-cr', 'Properties in Costa Rica', 'https://www.propertiesincostarica.com/', 'WordPress'),
  ('sothebys-cr', 'Sothebys International Realty Costa Rica', 'https://www.sothebysrealty.com/eng/sales/cri', 'JS-heavy global site; needs Playwright'),
  ('dominical-realty', 'Dominical Realty', 'https://www.dominicalrealty.com/', 'WordPress + Houzez'),
  ('two-cr-real-estate', '2 Costa Rica Real Estate', 'https://www.2costaricarealestate.com/', 'WordPress'),
  ('cr-dream-makers', 'Costa Rica Dream Makers', 'https://www.costaricadreammakers.com/en/real-estate-listings.php', 'PHP — custom backend'),
  ('rpm-real-estate-cr', 'RPM Real Estate Costa Rica', 'https://rpmrealestatecr.com/', 'WordPress')
on conflict (slug) do nothing;

-- New source_configs (default cron + caps; user can edit in /admin/sources)
insert into source_configs (source_id, regions, max_listings_per_run)
select s.id, array['central-pacific','guanacaste','central-valley','nicoya','caribbean','south-pacific'], 200
from sources s
where s.slug in (
  'realtor-com-cr','re-cr','coldwell-cb-tamarindo','properties-in-cr',
  'sothebys-cr','dominical-realty','two-cr-real-estate','cr-dream-makers','rpm-real-estate-cr'
)
  and not exists (select 1 from source_configs sc where sc.source_id = s.id);

-- ============================================================
-- Categories
-- Cross-cutting tags applied at normalize/enrich time. A listing can carry
-- multiple categories — e.g. a beachfront luxury home is in 3 of them.
-- ============================================================
alter table canonical_listings
  add column if not exists categories text[] default '{}';

create index if not exists canonical_listings_categories_idx on canonical_listings using gin (categories);

-- Reference table — drives the dashboard filter UI + the categorisation rule order.
create table if not exists listing_categories (
  slug text primary key,
  name text not null,
  description text,
  display_order int default 0
);

insert into listing_categories (slug, name, description, display_order) values
  ('homes-and-villas',  'Homes and Villas',   'Single-family homes, villas, casas — the primary residential bucket.', 10),
  ('condominiums',      'Condominiums',       'Condos and apartment-building units — shared-amenity living.',          20),
  ('lots',              'Lots',               'Land for sale — buildable parcels and farms intended as raw land.',     30),
  ('beach-properties',  'Beach Properties',   'Within ~5 km of a beach OR features beachfront/walk-to-beach.',          40),
  ('luxury-properties', 'Luxury Properties',  'Price USD ≥ $1M OR explicitly tagged luxury.',                          50)
on conflict (slug) do nothing;

-- Helper SQL function: derive categories from a canonical_listing row.
-- Used by the publish stage to populate the categories array.
create or replace function derive_listing_categories(
  p_property_type text,
  p_price_usd numeric,
  p_distance_to_beach_km numeric,
  p_features text[],
  p_tags_ai text[]
) returns text[] as $$
declare
  result text[] := '{}';
begin
  if p_property_type in ('house','farm') then
    result := array_append(result, 'homes-and-villas');
  end if;
  if p_property_type = 'condo' then
    result := array_append(result, 'condominiums');
  end if;
  if p_property_type = 'lot' then
    result := array_append(result, 'lots');
  end if;
  if (p_distance_to_beach_km is not null and p_distance_to_beach_km <= 5)
     or 'beachfront' = any(p_features)
     or 'oceanfront' = any(p_features)
     or 'walk_to_beach' = any(p_features)
     or 'beachfront' = any(coalesce(p_tags_ai, '{}'))
  then
    result := array_append(result, 'beach-properties');
  end if;
  if (p_price_usd is not null and p_price_usd >= 1000000)
     or 'luxury' = any(coalesce(p_tags_ai, '{}'))
  then
    result := array_append(result, 'luxury-properties');
  end if;
  return result;
end;
$$ language plpgsql immutable;

-- Backfill categories on existing rows
update canonical_listings cl
set categories = derive_listing_categories(
  cl.property_type, cl.price_usd, cl.distance_to_beach_km, cl.features, cl.tags_ai
)
where cl.categories is null or cl.categories = '{}';

-- View update — expose categories on listing cards
drop view if exists v_listings_card;
create view v_listings_card as
select
  cl.id, cl.slug, cl.status, cl.title_en, cl.title_es, cl.property_type,
  cl.price_usd, cl.bedrooms, cl.bathrooms, cl.bathrooms_total,
  cl.interior_sqm, cl.lot_sqm, cl.year_built,
  cl.region_slug, cl.locality, cl.canton, cl.province, cl.lat, cl.lng,
  cl.community_name, cl.gated_community,
  cl.tags_ai, cl.tags_human, cl.features, cl.view_types,
  cl.categories,
  cl.distance_to_beach_km, cl.distance_to_airport_km, cl.nearest_airport_code,
  (select coalesce(p.url_supabase, p.url_source) from photos p
    where p.canonical_listing_id = cl.id and p.is_hero = true and not p.is_rejected limit 1) as hero_url,
  (select coalesce(p.url_supabase, p.url_source) from photos p
    where p.canonical_listing_id = cl.id and not p.is_rejected order by p.position limit 1) as fallback_url,
  cl.last_seen_at,
  cl.wp_post_id,
  cl.realtor_review_status
from canonical_listings cl;
