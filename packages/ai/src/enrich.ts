import {
  callAnthropic,
  tryParseJson,
  logger,
  FeatureVocab,
  TagVocab,
  type EnrichedListing,
  type NormalizedListing,
  type RawListingPayload,
} from '@crdg/core';
import {
  TRANSLATE_SYSTEM,
  buildTranslateUserMessage,
  REWRITE_SYSTEM,
  buildRewriteUserMessage,
  buildTagSystem,
  buildTagUserMessage,
  HERO_PHOTO_SYSTEM,
} from './prompts/enrich.js';

const HAIKU = 'claude-haiku-4-5-20251001' as const;
const SONNET = 'claude-sonnet-4-6-20250929' as const;
const MAX_PHOTOS_FOR_HERO = 6;

export interface EnrichOpts {
  /** Skip hero photo selection (useful when no photos). */
  skipHero?: boolean;
  /** Skip CRDG-voice rewrite (useful in tests / when budget tight). */
  skipRewrite?: boolean;
}

export interface EnrichResult {
  enriched: EnrichedListing;
  costUsd: number;
}

interface TranslateOut {
  title_en: string;
  title_es: string;
  description_en: string;
  description_es: string;
}

interface RewriteOut {
  description_en_rewritten: string;
  description_es_rewritten: string;
}

interface TagOut {
  features: string[];
  tags: string[];
}

interface HeroOut {
  hero_index: number;
  alt_texts: Record<string, string>;
}

async function translate(n: NormalizedListing): Promise<{ out: TranslateOut | null; costUsd: number }> {
  const r = await callAnthropic({
    model: HAIKU,
    system: TRANSLATE_SYSTEM,
    messages: [{ role: 'user', content: buildTranslateUserMessage({ title: n.title, description: n.description, language: n.language }) }],
    maxTokens: 1500,
    temperature: 0,
    purpose: 'enrich.translate',
  });
  try {
    const out = tryParseJson<TranslateOut>(r.text);
    return { out, costUsd: r.costUsd };
  } catch (e) {
    logger.warn({ err: (e as Error).message, snippet: r.text.slice(0, 200) }, 'enrich.translate.parse_failed');
    return { out: null, costUsd: r.costUsd };
  }
}

async function rewriteCrdgVoice(n: NormalizedListing, t: TranslateOut | null): Promise<{ out: RewriteOut | null; costUsd: number }> {
  const facts = {
    property_type: n.property_type,
    bedrooms: n.bedrooms,
    bathrooms: n.bathrooms,
    interior_sqm: n.interior_sqm,
    lot_sqm: n.lot_sqm,
    locality: n.locality,
    canton: n.canton,
    province: n.province,
    price_usd: n.price_usd,
    features: n.features,
  };
  const r = await callAnthropic({
    model: SONNET,
    system: REWRITE_SYSTEM,
    messages: [{ role: 'user', content: buildRewriteUserMessage({
      title: t?.title_en ?? n.title,
      description_en: t?.description_en ?? null,
      description_es: t?.description_es ?? null,
      facts,
    }) }],
    maxTokens: 2000,
    temperature: 0.3,
    purpose: 'enrich.rewrite',
  });
  try {
    const out = tryParseJson<RewriteOut>(r.text);
    return { out, costUsd: r.costUsd };
  } catch (e) {
    logger.warn({ err: (e as Error).message, snippet: r.text.slice(0, 200) }, 'enrich.rewrite.parse_failed');
    return { out: null, costUsd: r.costUsd };
  }
}

async function tagListing(n: NormalizedListing): Promise<{ out: TagOut; costUsd: number }> {
  const r = await callAnthropic({
    model: HAIKU,
    system: buildTagSystem(FeatureVocab, TagVocab),
    messages: [{ role: 'user', content: buildTagUserMessage({ title: n.title, description: n.description, rawFeatures: n.features }) }],
    maxTokens: 600,
    temperature: 0,
    purpose: 'enrich.tag',
  });
  let out: TagOut = { features: [], tags: [] };
  try {
    const parsed = tryParseJson<TagOut>(r.text);
    const validFeatures = new Set<string>(FeatureVocab);
    const validTags = new Set<string>(TagVocab);
    out = {
      features: (parsed.features ?? []).filter((f) => validFeatures.has(f)),
      tags: (parsed.tags ?? []).filter((t) => validTags.has(t)),
    };
  } catch (e) {
    logger.warn({ err: (e as Error).message, snippet: r.text.slice(0, 200) }, 'enrich.tag.parse_failed');
  }
  return { out, costUsd: r.costUsd };
}

async function selectHeroPhoto(photos: RawListingPayload['photos']): Promise<{ out: HeroOut | null; costUsd: number }> {
  if (!photos || photos.length === 0) return { out: null, costUsd: 0 };
  const subset = photos.slice(0, MAX_PHOTOS_FOR_HERO);

  // Multimodal Haiku: pass URLs as image blocks
  const userContent: Array<
    | { type: 'image'; source: { type: 'url'; url: string } }
    | { type: 'text'; text: string }
  > = subset.map((p) => ({ type: 'image' as const, source: { type: 'url' as const, url: p.url } }));
  userContent.push({
    type: 'text' as const,
    text: `Photos provided in order, indices 0..${subset.length - 1}. Pick the best hero photo and produce alt-texts. JSON only.`,
  });

  try {
    // SDK type for image source.url is technically supported on recent versions; cast through unknown.
    const r = await callAnthropic({
      model: HAIKU,
      system: HERO_PHOTO_SYSTEM,
      messages: [{ role: 'user', content: userContent as unknown as never }],
      maxTokens: 800,
      temperature: 0,
      purpose: 'enrich.hero_photo',
    });
    const out = tryParseJson<HeroOut>(r.text);
    return { out, costUsd: r.costUsd };
  } catch (e) {
    logger.warn({ err: (e as Error).message }, 'enrich.hero_photo.failed');
    return { out: null, costUsd: 0 };
  }
}

/**
 * Stage 4: enrich a NormalizedListing into an EnrichedListing.
 * Runs translate / rewrite / tag concurrently, then hero photo selection.
 */
export async function enrich(
  normalized: NormalizedListing,
  raw: RawListingPayload,
  opts: EnrichOpts = {},
): Promise<EnrichResult> {
  const tasks: Array<Promise<unknown>> = [];

  const translateP = translate(normalized);
  tasks.push(translateP);

  const tagP = tagListing(normalized);
  tasks.push(tagP);

  // Hero kicked off in parallel; doesn't depend on translation
  const heroP = opts.skipHero ? Promise.resolve({ out: null, costUsd: 0 }) : selectHeroPhoto(raw.photos);
  tasks.push(heroP);

  const [translated, tagged, hero] = await Promise.all([translateP, tagP, heroP]);

  // Rewrite needs translation output; run after translate.
  let rewritten: { out: RewriteOut | null; costUsd: number } = { out: null, costUsd: 0 };
  if (!opts.skipRewrite) {
    rewritten = await rewriteCrdgVoice(normalized, translated.out);
  }

  const totalCost = translated.costUsd + tagged.costUsd + hero.costUsd + rewritten.costUsd;

  // Combine into EnrichedListing
  const enriched: EnrichedListing = {
    ...normalized,
    title_en: translated.out?.title_en ?? (normalized.language === 'en' ? normalized.title ?? null : null),
    title_es: translated.out?.title_es ?? (normalized.language === 'es' ? normalized.title ?? null : null),
    description_en: rewritten.out?.description_en_rewritten ?? translated.out?.description_en ?? null,
    description_es: rewritten.out?.description_es_rewritten ?? translated.out?.description_es ?? null,
    description_raw: normalized.description ?? null,
    features: tagged.out.features.length ? tagged.out.features : normalized.features,
    tags_ai: tagged.out.tags,
    hero_photo_index: hero.out?.hero_index ?? 0,
    photos_alt: hero.out?.alt_texts ?? {},
  };

  return { enriched, costUsd: totalCost };
}
