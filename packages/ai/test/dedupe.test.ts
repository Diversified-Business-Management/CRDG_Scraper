import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@anthropic-ai/sdk', () => {
  const create = vi.fn();
  class MockClient {
    messages = { create };
  }
  return { default: MockClient };
});

vi.mock('@crdg/core/supabase', () => ({
  pgQuery: vi.fn(async () => []),
  getPgPool: vi.fn(),
  getServiceClient: vi.fn(),
}));

import type { NormalizedListing } from '@crdg/core';
import { dedupe, hashEmbedding, buildEmbeddingText } from '../src/dedupe.js';

const sample: NormalizedListing = {
  title: 'Modern Condo in Tamarindo',
  description: '',
  language: 'en',
  property_type: 'condo',
  price: 425000,
  price_currency: 'USD',
  bedrooms: 3,
  bathrooms: 2,
  interior_sqm: 140,
  lot_sqm: null,
  year_built: null,
  province: 'Guanacaste',
  canton: null,
  district: null,
  locality: 'Tamarindo',
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
  price_usd: 425000,
  price_per_sqm: 3035.71,
  region_slug: 'guanacaste',
  geocode_confidence: null,
  slug: 'modern-condo-in-tamarindo-abc',
};

describe('hashEmbedding', () => {
  it('produces a 1024-dim unit vector deterministically', () => {
    const v1 = hashEmbedding('foo');
    const v2 = hashEmbedding('foo');
    expect(v1.length).toBe(1024);
    expect(v1).toEqual(v2);
    let mag = 0;
    for (const x of v1) mag += x * x;
    expect(mag).toBeCloseTo(1, 3);
  });

  it('produces different vectors for different inputs', () => {
    const a = hashEmbedding('foo');
    const b = hashEmbedding('bar');
    let dot = 0;
    for (let i = 0; i < a.length; i++) dot += (a[i] ?? 0) * (b[i] ?? 0);
    expect(Math.abs(dot)).toBeLessThan(0.5);
  });
});

describe('buildEmbeddingText', () => {
  it('includes all the relevant fields', () => {
    const t = buildEmbeddingText(sample);
    expect(t).toContain('Modern Condo in Tamarindo');
    expect(t).toContain('Tamarindo');
    expect(t).toContain('Guanacaste');
    expect(t).toContain('3br');
    expect(t).toContain('2ba');
    expect(t).toContain('140m²');
    expect(t).toContain('$425000');
  });
});

describe('dedupe()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 'create' when no candidates exist", async () => {
    const judge = vi.fn();
    const { result, costUsd } = await dedupe(sample, {
      findCandidates: async () => [],
      fetchCanonical: async () => null,
      judge,
    });
    expect(result.action).toBe('create');
    expect(result.method).toBe('no_match');
    expect(judge).not.toHaveBeenCalled();
    expect(costUsd).toBe(0);
  });

  it("returns 'merge' when judge confidence >= MERGE_THRESHOLD (0.99)", async () => {
    const { result, costUsd } = await dedupe(sample, {
      findCandidates: async () => [{ canonical_listing_id: 'canon-1', similarity: 0.999 }],
      fetchCanonical: async () => ({ id: 'canon-1', title_en: 'Modern Condo Tamarindo' }),
      judge: async () => ({ match: true, confidence: 0.995, reason: 'same address', costUsd: 0.001 }),
    });
    expect(result.action).toBe('merge');
    expect(result.canonical_listing_id).toBe('canon-1');
    expect(result.confidence).toBeCloseTo(0.995, 5);
    expect(result.method).toBe('embedding');
    expect(costUsd).toBeCloseTo(0.001, 5);
  });

  it("returns 'review' when judge confidence in [REVIEW_THRESHOLD, MERGE_THRESHOLD)", async () => {
    const { result } = await dedupe(sample, {
      findCandidates: async () => [{ canonical_listing_id: 'canon-2', similarity: 0.97 }],
      fetchCanonical: async () => ({ id: 'canon-2', title_en: 'Tamarindo Condo' }),
      judge: async () => ({ match: false, confidence: 0.97, reason: 'similar but not certain', costUsd: 0.001 }),
    });
    expect(result.action).toBe('review');
    expect(result.canonical_listing_id).toBe('canon-2');
    expect(result.confidence).toBeCloseTo(0.97, 5);
  });

  it("returns 'create' when best confidence < REVIEW_THRESHOLD", async () => {
    const { result } = await dedupe(sample, {
      findCandidates: async () => [{ canonical_listing_id: 'canon-3', similarity: 0.4 }],
      fetchCanonical: async () => ({ id: 'canon-3', title_en: 'Different Place' }),
      judge: async () => ({ match: false, confidence: 0.2, reason: 'no', costUsd: 0.001 }),
    });
    expect(result.action).toBe('create');
    expect(result.confidence).toBeCloseTo(0.2, 5);
  });

  it('picks the best candidate across multiple judgments', async () => {
    let i = 0;
    const judgments = [
      { match: false, confidence: 0.3, reason: 'a', costUsd: 0.001 },
      { match: true, confidence: 0.998, reason: 'b', costUsd: 0.001 },
      { match: false, confidence: 0.5, reason: 'c', costUsd: 0.001 },
    ];
    const { result, costUsd } = await dedupe(sample, {
      findCandidates: async () => [
        { canonical_listing_id: 'a', similarity: 0.9 },
        { canonical_listing_id: 'b', similarity: 0.85 },
        { canonical_listing_id: 'c', similarity: 0.8 },
      ],
      fetchCanonical: async (id) => ({ id }),
      judge: async () => judgments[i++]!,
    });
    expect(result.action).toBe('merge');
    expect(result.canonical_listing_id).toBe('b');
    // The function short-circuits at the first >= MERGE_THRESHOLD hit, so only 2 calls
    expect(costUsd).toBeCloseTo(0.002, 5);
  });
});
