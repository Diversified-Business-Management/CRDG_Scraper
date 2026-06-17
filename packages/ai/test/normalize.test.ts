import { describe, it, expect, vi } from 'vitest';

// Pure functions but normalize calls toUsd which fetches FX rates.
// Intercept fetch to return a deterministic rate.
vi.stubGlobal('fetch', vi.fn(async () =>
  new Response(JSON.stringify({ rates: { USD: 1, CRC: 540 } }), { status: 200, headers: { 'content-type': 'application/json' } }),
));

vi.mock('@crdg/core/supabase', () => ({
  pgQuery: vi.fn(async () => []),
  getPgPool: vi.fn(),
  getServiceClient: vi.fn(),
}));

import { normalize, lookupRegionByLocality, lookupRegionByCoords, buildSlug } from '../src/normalize.js';
import type { ExtractedListing } from '@crdg/core';

const base: ExtractedListing = {
  title: 'Casa en Nosara',
  description: 'Hermosa casa',
  language: 'es',
  property_type: 'house',
  price: 350000,
  price_currency: 'USD',
  bedrooms: 3,
  bathrooms: 2.5,
  interior_sqm: 200,
  lot_sqm: 1500,
  year_built: 2018,
  province: null,
  canton: null,
  district: null,
  locality: 'Nosara',
  address_line: null,
  lat: null,
  lng: null,
  features: [],
  hoa_fee_usd: null,
  taxes_usd_annual: null,
  mls_id: null,
  agent_name: null,
  agent_email: null,
  agent_phone: null,
  listed_at: null,
  confidence_per_field: {},
  notes: null,
};

describe('lookupRegionByLocality', () => {
  it('matches well-known Costa Rican towns to CRDG regions', () => {
    expect(lookupRegionByLocality('Tamarindo')).toBe('guanacaste');
    expect(lookupRegionByLocality('Nosara')).toBe('nicoya');
    expect(lookupRegionByLocality('Santa Teresa')).toBe('nicoya');
    expect(lookupRegionByLocality('Jaco')).toBe('central-pacific');
    expect(lookupRegionByLocality('Manuel Antonio')).toBe('central-pacific');
    expect(lookupRegionByLocality('Dominical')).toBe('south-pacific');
    expect(lookupRegionByLocality('Uvita')).toBe('south-pacific');
    expect(lookupRegionByLocality('Ojochal')).toBe('south-pacific');
    expect(lookupRegionByLocality('Puerto Viejo')).toBe('caribbean');
    expect(lookupRegionByLocality('Cahuita')).toBe('caribbean');
    expect(lookupRegionByLocality('Atenas')).toBe('central-valley');
    expect(lookupRegionByLocality('Escazu')).toBe('central-valley');
    expect(lookupRegionByLocality('Santa Ana')).toBe('central-valley');
    expect(lookupRegionByLocality('Heredia')).toBe('central-valley');
    expect(lookupRegionByLocality('Grecia')).toBe('central-valley');
    expect(lookupRegionByLocality('Sarchi')).toBe('central-valley');
  });

  it('handles "Locality, Province" form via contains-match', () => {
    expect(lookupRegionByLocality('Nosara, Guanacaste')).toBe('nicoya');
  });

  it('returns null for unknown localities', () => {
    expect(lookupRegionByLocality('Atlantis')).toBeNull();
    expect(lookupRegionByLocality(null, undefined, '')).toBeNull();
  });
});

describe('lookupRegionByCoords', () => {
  it('places coords near Tamarindo in guanacaste box', () => {
    expect(lookupRegionByCoords(10.3, -85.85)).toBe('guanacaste');
  });
  it('places coords near Manuel Antonio in central-pacific', () => {
    expect(lookupRegionByCoords(9.4, -84.15)).toBe('central-pacific');
  });
  it('places coords near Puerto Viejo in caribbean', () => {
    expect(lookupRegionByCoords(9.65, -82.75)).toBe('caribbean');
  });
  it('returns null when lat/lng are missing', () => {
    expect(lookupRegionByCoords(null, null)).toBeNull();
    expect(lookupRegionByCoords(undefined, undefined)).toBeNull();
  });
});

describe('buildSlug', () => {
  it('produces a URL-safe slug with a short suffix', () => {
    const slug = buildSlug({ title: 'Casa en Nosara con Piscina', locality: null });
    expect(slug).toMatch(/^casa-en-nosara-con-piscina-[a-z0-9]{3,8}$/);
  });
  it('falls back to locality, then to "untitled"', () => {
    expect(buildSlug({ title: null, locality: 'Tamarindo' })).toMatch(/^tamarindo-/);
    expect(buildSlug({ title: null, locality: null })).toMatch(/^untitled-/);
  });
  it('caps the slug base length', () => {
    const long = 'a'.repeat(200);
    const slug = buildSlug({ title: long, locality: null });
    // base is capped to 60 chars + suffix
    expect(slug.length).toBeLessThanOrEqual(60 + 1 + 8);
  });
});

describe('normalize()', () => {
  it('passes USD prices through unchanged and computes price_per_sqm', async () => {
    const n = await normalize(base, { slugSuffix: 'abc123' });
    expect(n.price_usd).toBe(350000);
    expect(n.price_per_sqm).toBe(1750); // 350000/200
    expect(n.region_slug).toBe('nicoya');
    expect(n.geocode_confidence).toBeNull();
    expect(n.slug).toBe('casa-en-nosara-abc123');
  });

  it('converts CRC to USD via toUsd', async () => {
    const n = await normalize({ ...base, price: 270_000_000, price_currency: 'CRC' }, { slugSuffix: 'x' });
    // 270M CRC / 540 = 500_000 USD
    expect(n.price_usd).toBe(500000);
  });

  it('marks geocode_confidence=exact when lat/lng present', async () => {
    const n = await normalize({ ...base, lat: 9.55, lng: -85.65 }, { slugSuffix: 'x' });
    expect(n.geocode_confidence).toBe('exact');
  });

  it('falls back to coord-based region when locality is unknown', async () => {
    const n = await normalize({ ...base, locality: 'Atlantis', lat: 9.4, lng: -84.15 }, { slugSuffix: 'x' });
    expect(n.region_slug).toBe('central-pacific');
  });

  it('leaves region_slug null when neither locality nor coords resolve', async () => {
    const n = await normalize({ ...base, locality: 'Atlantis', lat: null, lng: null }, { slugSuffix: 'x' });
    expect(n.region_slug).toBeNull();
  });

  it('handles missing currency by assuming USD', async () => {
    const n = await normalize({ ...base, price: 100_000, price_currency: null }, { slugSuffix: 'x' });
    expect(n.price_usd).toBe(100_000);
  });

  it('skips price_per_sqm when interior_sqm is missing or zero', async () => {
    const n = await normalize({ ...base, interior_sqm: null }, { slugSuffix: 'x' });
    expect(n.price_per_sqm).toBeNull();
  });
});
