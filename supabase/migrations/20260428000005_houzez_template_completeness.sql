-- Cover the remaining Houzez V4 template meta fields we didn't already capture.

alter table canonical_listings
  add column if not exists tour_360_url text,
  add column if not exists video_thumbnail_url text,
  add column if not exists energy_class text,                  -- EU-style A..G rating
  add column if not exists energy_index numeric(8,2),          -- kWh/m²/year
  add column if not exists property_labels text[] default '{}', -- Houzez fave_property_label taxonomy ("Investment", "Move-In Ready", "Price Reduced", etc)
  add column if not exists attachments jsonb default '[]'::jsonb; -- [{url, label, kind}] for brochures, contracts, PDFs

create index if not exists canonical_listings_property_labels_idx on canonical_listings using gin (property_labels);

-- Map enable/disable + street view toggles. Houzez stores these as 'enable'/'disable'
-- strings in fave_property_map / fave_property_map_street_view; we store as booleans
-- and convert at sync time.
alter table canonical_listings
  add column if not exists show_map boolean default true,
  add column if not exists show_street_view boolean default true;
