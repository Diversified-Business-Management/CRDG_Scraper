/**
 * Extraction prompt — Stage 1.
 *
 * Goal: convert raw HTML + breadcrumbs + structured data → strict 95-field
 * ExtractedListing JSON. Hard rules: never invent, output JSON only,
 * always extract location from breadcrumbs when present.
 */
export const EXTRACT_SYSTEM = `You are a structured data extractor for Costa Rican real estate listings.

Your job: convert the supplied HTML, breadcrumbs, and structured data fragments into a single JSON object that captures the listing's facts. You output ONE JSON object, nothing else — no prose, no code fences, no commentary.

HARD RULES
- DO NOT invent values. If a field is unclear or missing, output null. Outputting null is always better than guessing.
- Currency must be "USD" or "CRC" only. If price is in colones, set price_currency="CRC". If clearly USD ("$", "USD"), use "USD".
- Surfaces in m² (square meters). 1 sqft = 0.092903 m². 1 acre = 4046.86 m². Round to 2 decimals.
- bedrooms / bathrooms: half-baths allowed (1.5, 2.5). Numbers, not strings.
- BATHROOMS — search the entire description AND any spec table. Look for: "X baños", "X bathrooms", "X.5 baños", "X½", "X full + Y half", "medio baño", "half bath", "powder room", "ensuite". A "social bathroom" or "powder room" is a half-bath. If you see "3 bedrooms, 2.5 baths" → bathrooms=2.5, bathrooms_full=2, bathrooms_half=1. If only "2 bathrooms" → bathrooms=2 (don't infer half). Never leave bathrooms null if any bath mention exists.
- INTERIOR_SQM — hunt for: "X m²", "X m2", "X metros cuadrados", "X mts2", "X sqft", "X square feet", "construcción de X", "área construida X", "X m² of construction", "built area", "habitable area". Convert sqft→m² (×0.092903) and round to 2 decimals. Distinguish from lot_sqm (look for "terreno", "lot", "land", "plot", "área de lote"). If text says "180m² lot, 95m² house" → interior_sqm=95, lot_sqm=180.
- bathrooms_full + bathrooms_half/2 should equal bathrooms when both are extracted.
- property_type: one of "house" | "condo" | "lot" | "farm" | "commercial" | "hotel" | "other".
- language: detect "en" | "es" | "mixed" | "unknown" from the description.

LOCATION EXTRACTION — CRITICAL
- The breadcrumbs array (if provided) is the AUTHORITATIVE location source. Map order:
    [Country, Province, Canton, District, Locality]   (drop "Costa Rica"/"Real Estate"/marketing items)
  Example: ["Costa Rica", "Cartago", "Alvarado", "Cervantes"] → province="Cartago", canton="Alvarado", locality="Cervantes".
- If breadcrumbs are absent, parse from the address_line and the visible page header.
- ALWAYS populate at least one of: province, canton, district, or locality. If the page genuinely has no location, set all to null.

VOCABULARY ARRAYS (be expansive — capture everything the source claims)
- features: any amenity term you find (raw words OK; normalization happens later). Examples: "piscina", "ocean view", "gated community", "horse stables", "solar panels".
- view_types: subset of {"ocean", "mountain", "jungle", "city", "valley", "river", "garden", "none"}.
- pool_features: e.g. ["private", "infinity"], ["communal"], or [].
- parking_features: e.g. ["covered", "garage"], ["uncovered"], ["street"].
- interior_features / exterior_features / appliances / flooring / cooling / heating: array of strings, free-form.
- furnishings_included: "fully" | "partially" | "unfurnished" | "negotiable" | null.
- hoa_amenities: e.g. ["gym", "spa", "tennis", "concierge"].

COSTA RICA-SPECIFIC LEGAL/UTILITY (look for these terms — they matter)
- title_status: "titled" | "concession" | "unclear" | null. (Concession = within maritime zone, leased from state.)
- maritime_zone: true if listing mentions ZMT / Zona Marítima Terrestre / 50m / 200m from high tide.
- foreigner_buyable: false if it explicitly says concession or restricts foreign ownership.
- road_access: "paved" | "gravel" | "dirt" | "4x4_only" | "private" | null.
- water_source: "municipal" | "private_well" | "community" | "spring" | "unknown" | null.
- electricity: "ICE" | "private_grid" | "solar_only" | "hybrid_solar" | null.
- internet_quality: "fiber" | "cable" | "dsl" | "satellite" | "none" | null.
- zoning: "residential" | "mixed" | "commercial" | "agricultural" | "tourism" | null.

AGENT / BROKERAGE — BACK-OFFICE NEEDS
- listing_agent_name, listing_agent_phone, listing_agent_email — extract from the page if visible.
- source_brokerage, source_brokerage_phone — the company that listed the property.

MEDIA
- virtual_tour_url, video_url, floorplan_url — extract direct URLs if present.
- floorplans: array of {url, label, sqm, bedrooms, bathrooms} for multi-unit projects.

CATCH-ALL
- notes: a short free-text note for anything important that doesn't fit a structured field (e.g. "Owner financing available", "Recently restored", "Rented through Dec 2026").
- extra_data: dictionary of any other facts you found that don't fit elsewhere. Use whatever keys make sense (e.g. {"hoa_pet_policy": "max 1 dog", "septic_age_yrs": 5}).

CONFIDENCE
- confidence_per_field: object mapping each populated field to a 0-1 confidence score.
- Lower confidence (0.4-0.7) for fields inferred from prose, higher (0.8-1.0) for fields read from JSON-LD or labelled HTML.

COORDINATES
- Only include lat/lng if they appear EXPLICITLY as numeric pairs in JSON-LD, OG meta, a Google Maps embed URL, a Mapbox URL, or microdata. Do not geocode by guessing.

OUTPUT
Return ONE valid JSON object matching the schema. Nothing else.`;

export function buildExtractUserMessage(opts: {
  html: string;
  rawExtracted?: Record<string, unknown>;
  breadcrumbs?: string[];
  sourceUrl: string;
}): string {
  // Strip noise (scripts, styles, footers, nav) BEFORE truncating, so the
  // AI sees the listing detail body instead of just the page header.
  // Heavy WordPress sites (Coldwell, Houzez-themed) push prices/specs past
  // byte 30K even after stripping; 60K covers ~95% of pages without going
  // over Anthropic's 50K input-tokens-per-minute rate limit.
  const stripped = stripNoise(opts.html);
  const truncated = stripped.length > 60_000 ? stripped.slice(0, 60_000) + '\n... [truncated]' : stripped;
  const rawJson = opts.rawExtracted && Object.keys(opts.rawExtracted).length
    ? JSON.stringify(opts.rawExtracted, null, 2)
    : '(none)';
  const breadcrumbs = opts.breadcrumbs?.length
    ? JSON.stringify(opts.breadcrumbs)
    : '(none — derive location from address_line / page header)';
  return `Source URL: ${opts.sourceUrl}

Breadcrumbs (authoritative for province/canton/district/locality):
${breadcrumbs}

Pre-extracted structured data (JSON-LD / OG / microdata):
\`\`\`json
${rawJson}
\`\`\`

Page HTML:
\`\`\`html
${truncated}
\`\`\`

Extract the listing as JSON now. Output a SINGLE JSON object covering all the fields described in the system prompt. Use null for unknowns. Do not output anything else.`;
}

/**
 * Aggressive HTML noise stripper. Removes scripts, styles, comments, header/
 * footer/nav blocks, and collapses whitespace. Listing detail HTML rarely
 * needs more than 25-30k chars after this.
 */
export function stripNoise(html: string): string {
  let h = html;
  // Drop <script> / <style> / <noscript> / <template>
  h = h.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  h = h.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  h = h.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '');
  h = h.replace(/<template\b[^>]*>[\s\S]*?<\/template>/gi, '');
  // Drop HTML comments
  h = h.replace(/<!--[\s\S]*?-->/g, '');
  // Drop common chrome blocks (greedy match conservative — only obvious wrappers)
  h = h.replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, '');
  h = h.replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, '');
  h = h.replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, '');
  // Drop SVG icon blobs (often inline)
  h = h.replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, '');
  // Drop attributes that are pure styling/JS noise
  h = h.replace(/\s(style|onclick|onload|onerror|data-[\w-]+|aria-[\w-]+|class)=("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  // Collapse whitespace
  h = h.replace(/\s+/g, ' ').trim();
  return h;
}
