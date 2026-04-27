import {
  callAnthropic,
  tryParseJson,
  ExtractedListing,
  type RawListingPayload,
  logger,
} from '@crdg/core';
import { EXTRACT_SYSTEM, buildExtractUserMessage } from './prompts/extract.js';

const MODEL = 'claude-haiku-4-5-20251001' as const;

export interface ExtractResult {
  extracted: import('@crdg/core').ExtractedListing;
  costUsd: number;
}

/**
 * Stage 1: Extract structured ExtractedListing from raw payload using Haiku.
 * Idempotent. On parse failure, returns a salvaged minimal extraction
 * rather than throwing — the caller can decide how to react.
 */
export async function extract(
  raw: RawListingPayload,
  opts: { runId?: string; model?: typeof MODEL } = {},
): Promise<ExtractResult> {
  const html = raw.raw_html ?? '';
  const sourceUrl = raw.source_url;
  const rawExtracted = raw.raw_extracted ?? {};
  const userMessage = buildExtractUserMessage({
    html,
    rawExtracted,
    sourceUrl,
  });

  const result = await callAnthropic({
    model: opts.model ?? MODEL,
    system: EXTRACT_SYSTEM,
    messages: [{ role: 'user', content: userMessage }],
    maxTokens: 2048,
    temperature: 0,
    purpose: 'extract',
  });

  const parsed = safeParse(result.text, raw);
  return { extracted: parsed, costUsd: result.costUsd };
}

/**
 * Parse the model's text into ExtractedListing. On failure, salvage what we can
 * from raw_extracted (JSON-LD typically has price/title/etc.).
 */
export function safeParse(
  text: string,
  raw: RawListingPayload,
): ExtractedListing {
  try {
    const json = tryParseJson<unknown>(text);
    return ExtractedListing.parse(json);
  } catch (e) {
    logger.warn(
      { err: (e as Error).message, snippet: text.slice(0, 200) },
      'extract.parse_failed_fallback_to_salvage',
    );
    return salvageFromRaw(raw);
  }
}

/**
 * When the AI output cannot be parsed, salvage what we can from the
 * pre-extracted JSON (JSON-LD/OG meta).
 */
export function salvageFromRaw(raw: RawListingPayload): ExtractedListing {
  const e = (raw.raw_extracted ?? {}) as Record<string, unknown>;
  const numOrNull = (v: unknown): number | null => {
    if (v == null) return null;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);

  // JSON-LD often nests under "offers" or top-level
  const offers = (e['offers'] as Record<string, unknown> | undefined) ?? {};
  return ExtractedListing.parse({
    title: strOrNull(e['name'] ?? e['title']),
    description: strOrNull(e['description']),
    language: 'unknown',
    property_type: null,
    price: numOrNull(e['price'] ?? offers['price']),
    price_currency: (() => {
      const c = strOrNull(e['priceCurrency'] ?? offers['priceCurrency']);
      if (c === 'USD' || c === 'CRC') return c;
      return null;
    })(),
    bedrooms: numOrNull(e['numberOfRooms'] ?? e['bedrooms']),
    bathrooms: numOrNull(e['numberOfBathroomsTotal'] ?? e['bathrooms']),
    interior_sqm: numOrNull(e['floorSize']),
    lot_sqm: numOrNull(e['lotSize']),
    year_built: null,
    province: null,
    canton: null,
    district: null,
    locality: strOrNull(
      ((e['address'] as Record<string, unknown> | undefined) ?? {})['addressLocality'],
    ),
    address_line: strOrNull(
      ((e['address'] as Record<string, unknown> | undefined) ?? {})['streetAddress'],
    ),
    lat: numOrNull(((e['geo'] as Record<string, unknown> | undefined) ?? {})['latitude']),
    lng: numOrNull(((e['geo'] as Record<string, unknown> | undefined) ?? {})['longitude']),
    features: [],
    hoa_fee_usd: null,
    taxes_usd_annual: null,
    mls_id: null,
    agent_name: null,
    agent_email: null,
    agent_phone: null,
    listed_at: null,
    confidence_per_field: {},
    notes: 'salvaged from raw_extracted after AI parse failure',
  });
}
