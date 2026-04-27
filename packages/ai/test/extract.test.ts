import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tamarindoFixture } from './fixtures/listing-tamarindo.js';

// Mock the Anthropic SDK at module level. callAnthropic uses the SDK client.
vi.mock('@anthropic-ai/sdk', () => {
  const create = vi.fn();
  class MockClient {
    messages = { create };
  }
  return {
    default: MockClient,
    // Anthropic also exports types, those don't matter at runtime.
  };
});

// Avoid touching pg/Supabase: stub recordAiCost path. Budget tracker preflight
// queries Postgres — bypass by not setting estimatedUsd on calls.
vi.mock('@crdg/core/supabase', () => ({
  pgQuery: vi.fn(async () => []),
  getPgPool: vi.fn(() => ({ query: vi.fn(async () => ({ rows: [] })), connect: vi.fn() })),
  getServiceClient: vi.fn(),
}));

const { default: Anthropic } = await import('@anthropic-ai/sdk');
const mockedCreate = (new (Anthropic as unknown as new () => { messages: { create: ReturnType<typeof vi.fn> } })()).messages.create;

describe('extract()', () => {
  beforeEach(() => {
    mockedCreate.mockReset();
  });

  it('parses a well-formed AI response into ExtractedListing', async () => {
    mockedCreate.mockResolvedValueOnce({
      id: 'msg_test',
      content: [{ type: 'text', text: tamarindoFixture.expectedAiText }],
      usage: { input_tokens: 5000, output_tokens: 400 },
      stop_reason: 'end_turn',
      role: 'assistant',
      type: 'message',
      model: 'claude-haiku-4-5-20251001',
    });

    const { extract } = await import('../src/extract.js');
    const { extracted, costUsd } = await extract({
      source_listing_id: 't1',
      source_url: 'https://example.com/listings/t1',
      raw_html: tamarindoFixture.html,
      raw_extracted: tamarindoFixture.rawExtracted,
      photos: [],
    });

    expect(extracted.title).toBe('Modern Condo in Tamarindo');
    expect(extracted.bedrooms).toBe(3);
    expect(extracted.bathrooms).toBe(2);
    expect(extracted.interior_sqm).toBe(140);
    expect(extracted.price).toBe(425000);
    expect(extracted.price_currency).toBe('USD');
    expect(extracted.locality).toBe('Tamarindo');
    expect(extracted.property_type).toBe('condo');
    expect(extracted.features).toContain('pool');
    expect(costUsd).toBeGreaterThan(0);
    // 5000 in @ $1/M + 400 out @ $5/M = 0.005 + 0.002 = 0.007
    expect(costUsd).toBeCloseTo(0.007, 5);
  });

  it('falls back to salvage from raw_extracted on AI parse failure', async () => {
    mockedCreate.mockResolvedValueOnce({
      id: 'msg_bad',
      content: [{ type: 'text', text: 'not json at all, sorry' }],
      usage: { input_tokens: 100, output_tokens: 10 },
      stop_reason: 'end_turn',
      role: 'assistant',
      type: 'message',
      model: 'claude-haiku-4-5-20251001',
    });

    const { extract } = await import('../src/extract.js');
    const { extracted } = await extract({
      source_listing_id: 't1',
      source_url: 'https://example.com/listings/t1',
      raw_html: '<html></html>',
      raw_extracted: tamarindoFixture.rawExtracted,
      photos: [],
    });

    // We salvaged from the JSON-LD even though the AI flopped
    expect(extracted.title).toBe('Modern Condo in Tamarindo');
    expect(extracted.price).toBe(425000);
    expect(extracted.locality).toBe('Tamarindo');
    expect(extracted.notes).toMatch(/salvaged/);
  });

  it('honors the 60k char HTML truncation', async () => {
    mockedCreate.mockResolvedValueOnce({
      id: 'msg_big',
      content: [{ type: 'text', text: tamarindoFixture.expectedAiText }],
      usage: { input_tokens: 10, output_tokens: 10 },
      stop_reason: 'end_turn',
      role: 'assistant',
      type: 'message',
      model: 'claude-haiku-4-5-20251001',
    });

    const { extract } = await import('../src/extract.js');
    const big = 'x'.repeat(120_000);
    await extract({
      source_listing_id: 't1',
      source_url: 'https://example.com/x',
      raw_html: big,
      raw_extracted: {},
      photos: [],
    });

    expect(mockedCreate).toHaveBeenCalledTimes(1);
    const call = mockedCreate.mock.calls[0]?.[0] as { messages: Array<{ content: string }> };
    const userContent = call.messages[0]?.content ?? '';
    // Truncation marker should appear, and full payload should be < 70k chars
    expect(userContent).toContain('[truncated]');
    expect(userContent.length).toBeLessThan(70_000);
  });
});
