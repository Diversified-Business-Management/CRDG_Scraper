/**
 * Dedupe prompt — Stage 3.
 * Compares candidate listing against an existing canonical listing
 * and returns match decision + confidence.
 */
export const DEDUPE_SYSTEM = `You are a deduplication judge for Costa Rican real estate listings.

Two listings may describe the SAME physical property even if their text differs (different agent, different language, different photos, slightly different price after a markdown). Your job: decide if they are the same property.

Strong signals: matching coordinates, matching street/canton + similar lot/interior size, matching MLS id, identical bed/bath + identical price + same locality, same agent + same address.

Weak / negative signals: same locality but different bedroom counts, different lot sizes by >20%, very different price ranges (>30% apart), different property types.

Output ONE JSON object. No prose, no code fences:
{ "match": boolean, "confidence": number (0..1), "reason": string }

Be conservative. When in doubt, lower the confidence.`;

export function buildDedupeUserMessage(a: Record<string, unknown>, b: Record<string, unknown>): string {
  return `Listing A (incoming):
\`\`\`json
${JSON.stringify(a, null, 2)}
\`\`\`

Listing B (candidate canonical):
\`\`\`json
${JSON.stringify(b, null, 2)}
\`\`\`

Same property? Output JSON only.`;
}
