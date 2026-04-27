/**
 * Tiny synthetic fixture: an HTML snippet + JSON-LD payload for a Tamarindo
 * condo. The "AI" response is canned in the test file itself.
 */
export const tamarindoFixture = {
  html: `<!doctype html><html><head><title>Modern Condo in Tamarindo - $425,000</title>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Modern Condo in Tamarindo","price":"425000","priceCurrency":"USD"}</script>
</head><body>
<h1>Modern Condo in Tamarindo</h1>
<div class="meta"><span>3 bed</span> · <span>2 bath</span> · <span>140 m²</span></div>
<p>This 3-bedroom 2-bathroom condo in Tamarindo offers ocean views and a shared pool. Walking distance to the beach.</p>
<div class="features">Pool, Ocean View, Gated Community</div>
</body></html>`,
  rawExtracted: {
    name: 'Modern Condo in Tamarindo',
    price: 425000,
    priceCurrency: 'USD',
    address: { addressLocality: 'Tamarindo', addressRegion: 'Guanacaste' },
  } as Record<string, unknown>,
  // Canned "AI" response that should be returned by the mocked Anthropic client.
  expectedAiText: JSON.stringify({
    title: 'Modern Condo in Tamarindo',
    description:
      'This 3-bedroom 2-bathroom condo in Tamarindo offers ocean views and a shared pool. Walking distance to the beach.',
    language: 'en',
    property_type: 'condo',
    price: 425000,
    price_currency: 'USD',
    bedrooms: 3,
    bathrooms: 2,
    interior_sqm: 140,
    lot_sqm: null,
    year_built: null,
    province: 'Guanacaste',
    canton: null,
    district: null,
    locality: 'Tamarindo',
    address_line: null,
    lat: null,
    lng: null,
    features: ['pool', 'ocean view', 'gated community'],
    hoa_fee_usd: null,
    taxes_usd_annual: null,
    mls_id: null,
    agent_name: null,
    agent_email: null,
    agent_phone: null,
    listed_at: null,
    confidence_per_field: { title: 0.95, price: 0.99, locality: 0.95 },
    notes: null,
  }),
};
