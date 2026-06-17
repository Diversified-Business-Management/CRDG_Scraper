/**
 * HTML/structured-data extraction helpers shared across adapters.
 */

import * as cheerio from 'cheerio';

/** Pull every <script type="application/ld+json"> block, JSON.parse each. Bad blocks skipped. */
export function extractJsonLd(html: string): Array<Record<string, unknown>> {
  const $ = cheerio.load(html);
  const out: Array<Record<string, unknown>> = [];
  $('script[type="application/ld+json"]').each((_i, el) => {
    const raw = $(el).contents().text();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const p of parsed) if (p && typeof p === 'object') out.push(p as Record<string, unknown>);
      } else if (parsed && typeof parsed === 'object') {
        // @graph wrapper used by many CMSes
        const graph = (parsed as { '@graph'?: unknown })['@graph'];
        if (Array.isArray(graph)) {
          for (const p of graph) if (p && typeof p === 'object') out.push(p as Record<string, unknown>);
        }
        out.push(parsed as Record<string, unknown>);
      }
    } catch {
      // Skip malformed JSON-LD silently — many sites have stray HTML in there.
    }
  });
  return out;
}

/** Pull <meta property="og:..."> and <meta name="og:..."> tags into a flat record. */
export function extractOpenGraph(html: string): Record<string, string> {
  const $ = cheerio.load(html);
  const out: Record<string, string> = {};
  $('meta').each((_i, el) => {
    const property = $(el).attr('property') || $(el).attr('name');
    const content = $(el).attr('content');
    if (!property || !content) return;
    if (property.startsWith('og:') || property.startsWith('product:') || property.startsWith('twitter:')) {
      out[property] = content;
    }
  });
  return out;
}

/** Resolve a relative URL against `base`. Returns absolute URL or empty string on failure. */
export function absolutizeUrl(maybeRelative: string | undefined | null, base: string): string {
  if (!maybeRelative) return '';
  const trimmed = maybeRelative.trim();
  if (!trimmed) return '';
  // Already absolute
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('//')) {
    try {
      const u = new URL(base);
      return `${u.protocol}${trimmed}`;
    } catch {
      return '';
    }
  }
  try {
    return new URL(trimmed, base).toString();
  } catch {
    return '';
  }
}

/**
 * Strip query params commonly used for resizing/CDN cache-busting, then dedupe.
 * Preserves original order.
 */
export function dedupePhotos(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    if (!u) continue;
    const key = canonicalisePhotoUrl(u);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(u);
  }
  return out;
}

const RESIZE_PARAM_RE = /^(w|h|width|height|q|quality|fit|crop|rs|rt|format|fm|auto|dpr|s|size|sz|version|v|cb)$/i;

function canonicalisePhotoUrl(u: string): string {
  try {
    const url = new URL(u);
    // Drop common resize params to dedupe variants of the same source image.
    const keep: [string, string][] = [];
    url.searchParams.forEach((v, k) => {
      if (!RESIZE_PARAM_RE.test(k)) keep.push([k, v]);
    });
    url.search = '';
    for (const [k, v] of keep) url.searchParams.append(k, v);
    // Some CDNs encode size in path: /500x500/, /w_640/, etc. Strip those.
    url.pathname = url.pathname
      .replace(/\/\d{2,4}x\d{2,4}\//g, '/')
      .replace(/\/(w|h|q|c)_[^/]+\//g, '/');
    return url.toString();
  } catch {
    return u;
  }
}

/** Pick the first scalar value out of a JSON-LD object (handles arrays / refs). */
export function jsonLdFirst<T = unknown>(value: unknown): T | undefined {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return value[0] as T | undefined;
  return value as T;
}

/** Find first JSON-LD entity whose @type matches one of `types`. */
export function findJsonLdByType(
  blocks: Array<Record<string, unknown>>,
  types: string[],
): Record<string, unknown> | undefined {
  const set = new Set(types.map((t) => t.toLowerCase()));
  for (const b of blocks) {
    const t = b['@type'];
    if (typeof t === 'string' && set.has(t.toLowerCase())) return b;
    if (Array.isArray(t)) {
      for (const tt of t) if (typeof tt === 'string' && set.has(tt.toLowerCase())) return b;
    }
  }
  return undefined;
}
