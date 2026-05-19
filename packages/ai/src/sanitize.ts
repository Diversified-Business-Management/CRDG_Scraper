/**
 * Title / description sanitizer.
 *
 * Source pages embed brand/site noise into the title: "Lomas del Sol #37 -
 * RPM Real Estate", "Charming home in Tamarindo | Costa Rica", "Houses For
 * Sale > Costa Rica". They also pass HTML entities through unchanged
 * (&#8211; &amp; &nbsp;).
 *
 * This module:
 *   - Decodes HTML entities
 *   - Strips trailing brand/site suffixes
 *   - Returns clean strings ready for storage
 */

const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&quot;': '"', '&#039;': "'", '&apos;': "'",
  '&nbsp;': ' ', '&lt;': '<', '&gt;': '>',
  '&#8211;': '–', '&#8212;': '—', '&#8216;': '‘', '&#8217;': '’',
  '&#8220;': '"', '&#8221;': '"', '&hellip;': '…', '&#8230;': '…',
  '&copy;': '©', '&reg;': '®', '&trade;': '™',
};

/** Decode &-entities (numeric + named) in a string. Safe on null/undefined. */
export function decodeEntities(s: string | null | undefined): string {
  if (!s) return '';
  // Named
  let out = s;
  for (const [enc, dec] of Object.entries(ENTITIES)) {
    out = out.split(enc).join(dec);
  }
  // Decimal numeric — &#1234;
  out = out.replace(/&#(\d+);/g, (_, n) => {
    const code = Number(n);
    return Number.isFinite(code) ? String.fromCodePoint(code) : _;
  });
  // Hex numeric — &#xABCD;
  out = out.replace(/&#x([0-9a-fA-F]+);/g, (_, n) => {
    const code = parseInt(n, 16);
    return Number.isFinite(code) ? String.fromCodePoint(code) : _;
  });
  return out;
}

// Trailing site/brand chunks we routinely see and want to strip.
// Order matters: longer / more specific first.
const TRAIL_NOISE = [
  / [-|·] RPM Real Estate.*$/i,
  / [-|·] Coldwell Banker.*$/i,
  / [-|·] Sotheby'?s.*$/i,
  / [-|·] Realtor\.com.*$/i,
  / [-|·] MLS\.cr.*$/i,
  / [-|·] Encuentra24.*$/i,
  / [-|·] Point2.*$/i,
  / [-|·] CRDG.*$/i,
  / \| Costa Rica$/i,
  / - Costa Rica$/i,
  / · Costa Rica$/i,
  / in Costa Rica$/i,         // only when at the very end
  /, ?Costa Rica$/i,          // ", Costa Rica" tail
  / - [A-Z][a-zA-Z ]+, Costa Rica$/i,  // " - Tamarindo, Costa Rica" tail (city, country)
  /Search.*\.\.\. ?/i,
  // Price tail: " - $329,000" / " - USD 350,000" — keep the structural title
  / - \$[\d,]+(?:\.\d+)?(?:\s*-.*)?$/,
  / - USD ?[\d,]+(?:\.\d+)?(?:\s*-.*)?$/i,
  / - CRC ?[\d,]+(?:\.\d+)?(?:\s*-.*)?$/i,
  // " : N" counter suffix that some sites append (e.g. " : 3" = third in list)
  / : \d+$/,
  // "For Sale - " prefix when it's redundant with the listing context
  /^For Sale - /i,
];

// Pipe-separated noise tokens that Encuentra24 puts BEFORE the actual title:
//   "Houses in Lindora | For Sale | House for sale in Lindora Santa Ana"
// We want just the last meaningful chunk.
const PIPE_NOISE_PREFIX = /^(Houses?|Condos?|Apartments?|Lots?|Properties|Real Estate|Homes?|Land)\b[^|]*\| For Sale \| /i;

/**
 * Clean a raw title. Decodes entities, strips trailing brand noise,
 * collapses whitespace. Returns null if the result is empty or just
 * leftover punctuation.
 */
export function cleanTitle(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = decodeEntities(raw).trim();
  // Strip Encuentra24-style leading category pipe-noise first
  s = s.replace(PIPE_NOISE_PREFIX, '').trim();
  // Multiple-pass trail cleanup — some titles have two noise tails stacked
  for (let i = 0; i < 3; i++) {
    const before = s;
    for (const re of TRAIL_NOISE) {
      s = s.replace(re, '').trim();
    }
    if (s === before) break;
  }
  s = s.replace(/\s+/g, ' ').replace(/^[\s\-|·]+|[\s\-|·]+$/g, '').trim();
  if (s.length < 3) return null;
  return s;
}

/**
 * Pick the best title from candidates. Prefer English over Spanish where
 * both look populated; fall back gracefully.
 */
export function pickPrimaryTitle(en: string | null | undefined, es: string | null | undefined): string | null {
  const cleanEn = cleanTitle(en);
  const cleanEs = cleanTitle(es);
  if (cleanEn && cleanEs && cleanEn === cleanEs) return cleanEn;
  return cleanEn ?? cleanEs;
}

/** Decode + collapse whitespace on description prose. */
export function cleanDescription(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = decodeEntities(raw).replace(/\s+/g, ' ').trim();
  return s.length < 10 ? null : s;
}
