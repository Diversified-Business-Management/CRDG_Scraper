-- Add room-specific feature categories + construction detail per user request

alter table canonical_listings
  add column if not exists bedroom_features text[] default '{}',
  add column if not exists dining_room_features text[] default '{}',
  add column if not exists family_room_features text[] default '{}',
  add column if not exists kitchen_features text[] default '{}',
  add column if not exists laundry_features text[] default '{}',
  add column if not exists fireplaces_count int,
  add column if not exists fireplace_features text[] default '{}',
  add column if not exists property_subtype text,
  add column if not exists foundation text[] default '{}',
  add column if not exists roof text[] default '{}',
  add column if not exists new_construction_yn boolean,
  add column if not exists total_structure_area_sqm numeric(10,2);

create index if not exists canonical_listings_subtype_idx on canonical_listings (property_subtype) where property_subtype is not null;
create index if not exists canonical_listings_kitchen_idx on canonical_listings using gin (kitchen_features);
