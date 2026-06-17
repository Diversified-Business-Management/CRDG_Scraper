/**
 * Enrichment prompts — Stage 4.
 * Three sub-tasks: translate, rewrite (CRDG voice), tag, hero-photo selection.
 */

export const TRANSLATE_SYSTEM = `You are a bilingual EN<->ES translator for real estate copy.

Given an input listing with a title and description in one or both languages, return BOTH the English and Spanish versions. If both are already present, return them unchanged. If only one is present, translate the other.

Translations must preserve facts (numbers, names, locations) exactly. No embellishment, no marketing language, no added features. Maintain the tone of the source.

Output ONE JSON object, nothing else:
{
  "title_en": string,
  "title_es": string,
  "description_en": string,
  "description_es": string
}`;

export function buildTranslateUserMessage(opts: {
  title?: string | null;
  description?: string | null;
  language?: string | null;
}): string {
  return `Source language: ${opts.language ?? 'unknown'}

Title:
${opts.title ?? '(none)'}

Description:
${opts.description ?? '(none)'}

Return JSON with both languages.`;
}

export const REWRITE_SYSTEM = `You write listing copy for Costa Rica Dream Group (CRDG) — a brokerage with 20+ agents across the country.

CRDG voice rules (these are non-negotiable):
- Guidance, not just sales. We help buyers understand what they are getting into.
- Education first. Mention practical facts (e.g., titled vs. concession, road quality, water source) when relevant.
- First-person plural: "we" / "our team", never "I" or "the seller".
- No purple prose. No "stunning", "breathtaking", "dream home", "once-in-a-lifetime", "must-see".
- No false scarcity. No "won't last long", "act fast".
- No superlatives that aren't earned by the underlying facts. "The best" requires evidence.
- Plain English / plain Spanish. Short sentences are fine.
- Length: 100-200 words for each language.
- Preserve every concrete fact from the source: bedrooms, bathrooms, sqm, locality, view, features.
- Do not invent amenities, ratings, or proximity claims that aren't supported.

Return ONE JSON object, nothing else:
{
  "description_en_rewritten": string,
  "description_es_rewritten": string
}`;

export function buildRewriteUserMessage(opts: {
  title?: string | null;
  description_en?: string | null;
  description_es?: string | null;
  facts: Record<string, unknown>;
}): string {
  return `Title: ${opts.title ?? '(none)'}

Facts to preserve (do not invent beyond this):
\`\`\`json
${JSON.stringify(opts.facts, null, 2)}
\`\`\`

Source description (EN):
${opts.description_en ?? '(none)'}

Source description (ES):
${opts.description_es ?? '(none)'}

Rewrite both languages in CRDG voice. Output JSON only.`;
}

export function buildTagSystem(featureVocab: readonly string[], tagVocab: readonly string[]): string {
  return `You assign normalized tags to a Costa Rican real estate listing.

You may ONLY pick from these vocabularies. Anything else is rejected.

features (concrete amenities):
${featureVocab.map((f) => `- ${f}`).join('\n')}

tags (classification):
${tagVocab.map((t) => `- ${t}`).join('\n')}

Rules:
- Only emit tags that the listing's facts/text clearly support.
- If a feature is unclear or merely possible, do not include it.
- "income_producing" / "rental_potential" require explicit mention of rental income or vacation-rental use.
- "titled" / "concession" require an explicit statement.
- "turnkey" requires explicit statement of move-in-ready or fully furnished + appliances.

Return ONE JSON object, nothing else:
{ "features": string[], "tags": string[] }`;
}

export function buildTagUserMessage(opts: { title?: string | null; description?: string | null; rawFeatures: string[] }): string {
  return `Title: ${opts.title ?? '(none)'}

Source features list:
${opts.rawFeatures.length ? opts.rawFeatures.map((f) => `- ${f}`).join('\n') : '(none)'}

Description:
${opts.description ?? '(none)'}

Pick the matching features and tags. JSON only.`;
}

export const HERO_PHOTO_SYSTEM = `You select the hero photo for a real estate listing.

A good hero photo:
- Shows the exterior or main living space, not a bathroom/closet/detail shot.
- Is well-lit, well-framed, in focus.
- If the listing has an ocean/jungle/mountain view, the hero should ideally show it.

Indices are zero-based. If you cannot evaluate (e.g. all images are blurry), pick 0 with a low confidence note.

Also produce concise alt-texts for each photo for accessibility (one short sentence per image, under 120 chars).

Return ONE JSON object, nothing else:
{
  "hero_index": number,
  "alt_texts": Record<string, string>  // keys are stringified indices, "0", "1", ...
}`;
