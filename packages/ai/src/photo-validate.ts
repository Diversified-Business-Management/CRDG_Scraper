/**
 * AI photo validation — Haiku 4.5 multimodal pass that determines, for each
 * photo, whether it actually depicts a property listing (interior/exterior/
 * view/lot) vs a logo, banner, screenshot, map, watermark, or unrelated.
 *
 * Designed to be cheap and parallel-able. Skips photos already flagged as
 * rejected by the URL/dimension filter.
 */
import { callAnthropic, tryParseJson, logger } from '@crdg/core';
import type { RawPhoto } from '@crdg/core';

const MODEL = 'claude-haiku-4-5-20251001' as const;

const SYSTEM = `You are a vision classifier for real-estate photo galleries.

For each image, decide if it shows the actual property being listed, OR if it is non-property content that should be removed from the gallery.

Reject any of: site logos, brokerage branding, app-store badges, map screenshots, MLS verification stickers, social media icons, watermarks, generic stock photography, real-estate-website UI elements, headshots of agents, banners, brochures, schematics that are not floor plans, advertisements.

Accept any of: house exteriors, interiors (rooms, kitchens, bathrooms), aerial views of the property, the lot/land, views FROM the property (ocean/mountain/jungle), legitimate floor plans, condo building exteriors when relevant.

When uncertain (e.g. small thumbnail, partial image), prefer accept unless it's clearly non-property.

Output ONE JSON object: {"decisions":[{"i":0,"verdict":"accept"|"reject","reason":"<short>"}, ...]} where i is the 0-indexed position in the input array. Output JSON only.`;

export interface PhotoValidationResult {
  /** Same length and order as input. true = property photo, false = reject. */
  verdicts: Array<{ verdict: 'accept' | 'reject'; reason: string }>;
  costUsd: number;
}

/**
 * Validate up to BATCH_SIZE photos in a single multimodal call. Returns
 * per-photo verdicts. Falls back to "accept" for photos the call couldn't
 * judge so we never silently drop something.
 */
const BATCH_SIZE = 4;

export async function validatePhotosWithVision(
  photos: RawPhoto[],
): Promise<PhotoValidationResult> {
  if (photos.length === 0) return { verdicts: [], costUsd: 0 };

  // Process in batches of BATCH_SIZE concurrent.
  const allVerdicts: PhotoValidationResult['verdicts'] = new Array(photos.length).fill({ verdict: 'accept', reason: 'default' });
  let totalCost = 0;

  for (let start = 0; start < photos.length; start += BATCH_SIZE) {
    const slice = photos.slice(start, start + BATCH_SIZE);
    try {
      const result = await callAnthropic(
        {
          model: MODEL,
          system: SYSTEM,
          messages: [
            {
              role: 'user',
              content: [
                ...slice.map((p, i) => ([
                  { type: 'text' as const, text: `Image ${i}:` },
                  { type: 'image' as const, source: { type: 'url' as const, url: p.url } as never },
                ])).flat(),
                { type: 'text' as const, text: 'Now output the decisions JSON.' },
              ],
            },
          ],
          maxTokens: 600,
          temperature: 0,
          purpose: 'photo_validate',
        },
        (text) => tryParseJson<{ decisions: Array<{ i: number; verdict: 'accept' | 'reject'; reason: string }> }>(text),
      );
      totalCost += result.costUsd;

      const decisions = result.parsed?.decisions ?? [];
      for (const d of decisions) {
        const idx = start + d.i;
        if (idx < allVerdicts.length) {
          allVerdicts[idx] = { verdict: d.verdict, reason: d.reason };
        }
      }
    } catch (e) {
      // On vision-call failure (commonly base64/url issues for some image formats)
      // accept all photos in this batch so the listing still publishes.
      logger.warn({ err: (e as Error).message, batchStart: start }, 'photo_validate.batch_failed');
    }
  }

  return { verdicts: allVerdicts, costUsd: totalCost };
}
