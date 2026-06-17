-- Per user request: explicit yes/no for jacuzzi, telephone, parking; arrays
-- for internet types and television types. Pool already covered by
-- pool_features[]; we add a derived boolean for filter convenience.

alter table canonical_listings
  add column if not exists jacuzzi_yn boolean,
  add column if not exists pool_yn boolean,
  add column if not exists parking_yn boolean,
  add column if not exists telephone_yn boolean,
  add column if not exists internet_types text[] default '{}',
  add column if not exists television_types text[] default '{}',
  add column if not exists ac_types text[] default '{}';   -- e.g. wall_unit, central, split, none

-- Backfill derived booleans from arrays where possible (idempotent).
update canonical_listings
   set pool_yn = case when array_length(pool_features, 1) > 0 then true else pool_yn end
 where pool_yn is null;
update canonical_listings
   set parking_yn = case when parking_spaces > 0 or garage_spaces > 0 then true else parking_yn end
 where parking_yn is null;

create index if not exists canonical_listings_internet_types_idx on canonical_listings using gin (internet_types);
create index if not exists canonical_listings_pool_yn_idx on canonical_listings (pool_yn) where pool_yn = true;
create index if not exists canonical_listings_jacuzzi_yn_idx on canonical_listings (jacuzzi_yn) where jacuzzi_yn = true;
