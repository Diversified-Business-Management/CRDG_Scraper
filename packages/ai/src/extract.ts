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
  const breadcrumbs = raw.breadcrumbs;
  const userMessage = buildExtractUserMessage({
    html,
    rawExtracted,
    breadcrumbs,
    sourceUrl,
  });

  const result = await callAnthropic({
    model: opts.model ?? MODEL,
    system: EXTRACT_SYSTEM,
    messages: [{ role: 'user', content: userMessage }],
    maxTokens: 4096,
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
    const json = tryParseJson<Record<string, unknown>>(text);
    // Apply breadcrumb-derived location if AI missed it
    const withBc = applyBreadcrumbsFallback(json, raw.breadcrumbs);
    // Apply title backstop: if AI returned null/empty but adapter captured one, use it
    const withTitle = applyTitleBackstop(withBc, raw);
    return ExtractedListing.parse(withTitle);
  } catch (e) {
    logger.warn(
      { err: (e as Error).message, snippet: text.slice(0, 200) },
      'extract.parse_failed_fallback_to_salvage',
    );
    return salvageFromRaw(raw);
  }
}

/**
 * Backstop: if AI returned null/empty for title but the adapter captured one
 * (via og:title or <title>), use the adapter's value. The sanitizer in
 * normalize.ts will then strip brand-noise tails.
 *
 * Encuentra24 / RPM / cr-dream-makers / coldwell all populate raw_extracted.title;
 * AI sometimes "forgets" to copy it through to the structured output.
 */
function applyTitleBackstop(obj: Record<string, unknown>, raw: RawListingPayload): Record<string, unknown> {
  const titleNow = obj['title'];
  if (typeof titleNow === 'string' && titleNow.trim().length > 0) return obj;
  const re = (raw.raw_extracted ?? {}) as Record<string, unknown>;
  const fromAdapter =
    (typeof re['title'] === 'string' && (re['title'] as string).trim()) ||
    (typeof (re['og'] as Record<string, unknown> | undefined)?.['og:title'] === 'string' &&
      ((re['og'] as Record<string, unknown>)['og:title'] as string).trim()) ||
    null;
  if (fromAdapter) return { ...obj, title: fromAdapter };
  return obj;
}

/** Backstop: if AI returned null for province/canton/locality but breadcrumbs are present, fill them in. */
function applyBreadcrumbsFallback(
  obj: Record<string, unknown>,
  breadcrumbs?: string[],
): Record<string, unknown> {
  if (!breadcrumbs || breadcrumbs.length === 0) return obj;
  // Drop generic items that aren't location levels
  const skip = /^(home|costa rica|real estate|for sale|properties|listings|search|sale)$/i;
  const levels = breadcrumbs.filter(b => b && !skip.test(b.trim()));
  // levels[0..3] usually map to province → canton → district → locality
  const out = { ...obj };
  if (!out['province'] && levels[0]) out['province'] = levels[0];
  if (!out['canton'] && levels[1]) out['canton'] = levels[1];
  if (!out['district'] && levels[2]) out['district'] = levels[2];
  if (!out['locality'] && levels[3]) out['locality'] = levels[3];
  // If only one level was extracted (e.g., just a town), use it as locality
  if (!out['locality'] && !out['district'] && levels[1] && !out['canton']) {
    out['locality'] = levels[1];
  }
  return out;
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
  const offers = (e['offers'] as Record<string, unknown> | undefined) ?? {};

  const breadcrumbLevels = (raw.breadcrumbs ?? []).filter(
    b => b && !/^(home|costa rica|real estate|for sale|properties|listings|search|sale)$/i.test(b.trim()),
  );

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
    province: breadcrumbLevels[0] ?? null,
    canton: breadcrumbLevels[1] ?? null,
    district: breadcrumbLevels[2] ?? null,
    locality: breadcrumbLevels[3] ?? strOrNull(
      ((e['address'] as Record<string, unknown> | undefined) ?? {})['addressLocality'],
    ),
    address_line: strOrNull(
      ((e['address'] as Record<string, unknown> | undefined) ?? {})['streetAddress'],
    ),
    lat: numOrNull(((e['geo'] as Record<string, unknown> | undefined) ?? {})['latitude']),
    lng: numOrNull(((e['geo'] as Record<string, unknown> | undefined) ?? {})['longitude']),
    features: [],
    confidence_per_field: {},
    notes: 'salvaged from raw_extracted after AI parse failure',
  });
}
