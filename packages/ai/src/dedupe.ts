import {
  callAnthropic,
  tryParseJson,
  pgQuery,
  logger,
  type NormalizedListing,
} from '@crdg/core';
import { DEDUPE_SYSTEM, buildDedupeUserMessage } from './prompts/dedupe.js';
import { createHash } from 'node:crypto';

const MODEL = 'claude-haiku-4-5-20251001' as const;

/** Fixed embedding dim for both Voyage 'voyage-2' and our hash fallback. */
const EMBEDDING_DIM = 1024;
// Without semantic embeddings (Voyage / OpenAI), dedupe is dangerous — the
// hash-pseudo-embedding will collide on similar boilerplate. Until production
// embeddings are wired up, raise both thresholds so the pipeline almost always
// creates a new canonical and never silently merges. The Haiku judge can still
// flag review-queue cases when source IDs match across our own data.
const MERGE_THRESHOLD = 0.99;
const REVIEW_THRESHOLD = 0.95;
const TOP_K = 5;

export type DedupeAction = 'merge' | 'review' | 'create';

export interface DedupeResult {
  action: DedupeAction;
  canonical_listing_id?: string | null;
  confidence: number;
  method: 'embedding' | 'no_match';
  text_hash: string;
  embedding: number[];
  reason?: string;
}

export interface DedupeReturn {
  result: DedupeResult;
  costUsd: number;
}

interface CandidateRow {
  canonical_listing_id: string;
  similarity: number;
}

/**
 * Build the canonical text used to embed a listing for dedupe.
 * Same shape regardless of input completeness, so identical hashes
 * mean identical inputs — useful for caching.
 */
export function buildEmbeddingText(n: NormalizedListing): string {
  const title = n.title ?? '';
  const locality = n.locality ?? '';
  const province = n.province ?? '';
  const beds = n.bedrooms ?? '';
  const baths = n.bathrooms ?? '';
  const sqm = n.interior_sqm ?? '';
  const price = n.price_usd ?? '';
  return `${title} | ${locality}, ${province} | ${beds}br ${baths}ba ${sqm}m² | $${price}`;
}

/**
 * Embedding provider. In production we use Voyage AI's `voyage-2` (Anthropic
 * does not host an embedding endpoint). When VOYAGE_API_KEY isn't set we fall
 * back to a deterministic hash-based pseudo-embedding — fine for development
 * and for tests, NOT acceptable for production.
 */
export async function embed(text: string): Promise<{ vector: number[]; provider: 'voyage' | 'hash-dev' }> {
  const key = process.env['VOYAGE_API_KEY'];
  if (key) {
    try {
      const res = await fetch('https://api.voyageai.com/v1/embeddings', {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({ input: text, model: 'voyage-2' }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`voyage http ${res.status}`);
      const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
      const vec = json.data[0]?.embedding;
      if (!vec) throw new Error('voyage: no embedding in response');
      return { vector: vec, provider: 'voyage' };
    } catch (e) {
      logger.warn({ err: (e as Error).message }, 'embed.voyage_failed_fallback_to_hash');
      return { vector: hashEmbedding(text), provider: 'hash-dev' };
    }
  }
  return { vector: hashEmbedding(text), provider: 'hash-dev' };
}

/**
 * Deterministic hash-based pseudo-embedding for development.
 * NOT semantically meaningful — only useful when paired with itself.
 * Kept tiny and fast: SHA-256 expanded into 1024 floats in [-1, 1].
 */
export function hashEmbedding(text: string, dim = EMBEDDING_DIM): number[] {
  const out: number[] = [];
  let counter = 0;
  while (out.length < dim) {
    const h = createHash('sha256').update(`${counter}::${text}`).digest();
    for (let i = 0; i < h.length && out.length < dim; i += 2) {
      const v = h.readUInt16BE(i);
      out.push((v / 0xffff) * 2 - 1);
    }
    counter++;
  }
  // Normalize to unit length so cosine == dot product
  let mag = 0;
  for (const x of out) mag += x * x;
  mag = Math.sqrt(mag) || 1;
  return out.map((x) => x / mag);
}

export interface DedupeOpts {
  /** Inject a custom candidate fetcher — useful for testing. */
  findCandidates?: (vec: number[]) => Promise<CandidateRow[]>;
  /** Inject a custom canonical-row fetcher — useful for testing. */
  fetchCanonical?: (id: string) => Promise<Record<string, unknown> | null>;
  /** Inject the AI judge — useful for testing. */
  judge?: (a: Record<string, unknown>, b: Record<string, unknown>) => Promise<{ match: boolean; confidence: number; reason: string; costUsd: number }>;
}

async function defaultFindCandidates(vec: number[]): Promise<CandidateRow[]> {
  // pgvector cosine distance: 1 - cosine_similarity. We want top K nearest.
  const literal = `[${vec.join(',')}]`;
  const rows = await pgQuery<{ canonical_listing_id: string; distance: number }>(
    `select canonical_listing_id, embedding <=> $1::vector as distance
       from listing_embeddings
      order by embedding <=> $1::vector asc
      limit ${TOP_K}`,
    [literal],
  );
  return rows.map((r) => ({ canonical_listing_id: r.canonical_listing_id, similarity: 1 - Number(r.distance) }));
}

async function defaultFetchCanonical(id: string): Promise<Record<string, unknown> | null> {
  const rows = await pgQuery<Record<string, unknown>>(
    `select id, title_en, title_es, locality, canton, province, region_slug,
            bedrooms, bathrooms, interior_sqm, lot_sqm, price_usd, lat, lng, mls_id
       from canonical_listings where id = $1 limit 1`,
    [id],
  );
  return rows[0] ?? null;
}

async function defaultJudge(a: Record<string, unknown>, b: Record<string, unknown>) {
  const r = await callAnthropic({
    model: MODEL,
    system: DEDUPE_SYSTEM,
    messages: [{ role: 'user', content: buildDedupeUserMessage(a, b) }],
    maxTokens: 300,
    temperature: 0,
    purpose: 'dedupe.judge',
  });
  let match = false;
  let confidence = 0;
  let reason = '';
  try {
    const j = tryParseJson<{ match: boolean; confidence: number; reason: string }>(r.text);
    match = !!j.match;
    confidence = Math.max(0, Math.min(1, Number(j.confidence) || 0));
    reason = String(j.reason ?? '');
  } catch (e) {
    logger.warn({ err: (e as Error).message, snippet: r.text.slice(0, 200) }, 'dedupe.parse_failed');
  }
  return { match, confidence, reason, costUsd: r.costUsd };
}

export async function dedupe(
  normalized: NormalizedListing,
  opts: DedupeOpts = {},
): Promise<DedupeReturn> {
  const text = buildEmbeddingText(normalized);
  const text_hash = createHash('sha256').update(text).digest('hex');
  const { vector, provider } = await embed(text);

  // Without semantic embeddings (Voyage / OpenAI), we can't trust the AI
  // judge to dedupe correctly — the hash-pseudo-embedding will pull random
  // candidates that the AI tends to optimistically merge. Always create.
  // Tests that inject findCandidates explicitly want to exercise the merge
  // path, so we only short-circuit in production (no overrides).
  const isProduction = !opts.findCandidates && !opts.judge;
  if (provider === 'hash-dev' && isProduction) {
    logger.warn('dedupe.skipped_hash_embedding (set VOYAGE_API_KEY to enable real dedup)');
    return {
      result: { action: 'create', confidence: 0, method: 'no_match', text_hash, embedding: vector },
      costUsd: 0,
    };
  }

  const find = opts.findCandidates ?? defaultFindCandidates;
  const fetchCanonical = opts.fetchCanonical ?? defaultFetchCanonical;
  const judge = opts.judge ?? defaultJudge;

  const candidates = await find(vector);
  if (candidates.length === 0) {
    return {
      result: { action: 'create', confidence: 0, method: 'no_match', text_hash, embedding: vector },
      costUsd: 0,
    };
  }

  const incoming: Record<string, unknown> = {
    title: normalized.title,
    locality: normalized.locality,
    canton: normalized.canton,
    province: normalized.province,
    region_slug: normalized.region_slug,
    bedrooms: normalized.bedrooms,
    bathrooms: normalized.bathrooms,
    interior_sqm: normalized.interior_sqm,
    lot_sqm: normalized.lot_sqm,
    price_usd: normalized.price_usd,
    lat: normalized.lat,
    lng: normalized.lng,
    mls_id: normalized.mls_id,
  };

  let best: { id: string; confidence: number; reason: string } | null = null;
  let totalCost = 0;
  for (const cand of candidates) {
    const canonical = await fetchCanonical(cand.canonical_listing_id);
    if (!canonical) continue;
    const j = await judge(incoming, canonical);
    totalCost += j.costUsd;
    if (!best || j.confidence > best.confidence) {
      best = { id: cand.canonical_listing_id, confidence: j.confidence, reason: j.reason };
    }
    if (j.confidence >= MERGE_THRESHOLD) break; // optimization — first strong match wins
  }

  if (!best) {
    return {
      result: { action: 'create', confidence: 0, method: 'no_match', text_hash, embedding: vector },
      costUsd: totalCost,
    };
  }

  if (best.confidence >= MERGE_THRESHOLD) {
    return {
      result: {
        action: 'merge',
        canonical_listing_id: best.id,
        confidence: best.confidence,
        method: 'embedding',
        reason: best.reason,
        text_hash,
        embedding: vector,
      },
      costUsd: totalCost,
    };
  }
  if (best.confidence >= REVIEW_THRESHOLD) {
    return {
      result: {
        action: 'review',
        canonical_listing_id: best.id,
        confidence: best.confidence,
        method: 'embedding',
        reason: best.reason,
        text_hash,
        embedding: vector,
      },
      costUsd: totalCost,
    };
  }
  return {
    result: { action: 'create', confidence: best.confidence, method: 'embedding', text_hash, embedding: vector },
    costUsd: totalCost,
  };
}
