/**
 * Operational limits — encoded so they're auditable in code review,
 * not buried in env or runtime config.
 *
 * Override per-source via source_configs.
 */
export const Limits = {
  perSource: {
    sustainedRps: 1.0,
    burst: 3,
    maxListingsPerRun: 2_000,
    autoPauseErrorRate: 0.20,
    autoPause5xxRate: 0.10,
  },
  ai: {
    maxConcurrent: 4,
    perCallTimeoutMs: 60_000,
  },
  photos: {
    maxPerListing: 12,
    maxEdgePx: 1_600,
    targetMime: 'image/webp' as const,
    quality: 0.80,
  },
  wp: {
    batchSize: 25,
    pauseBetweenBatchesMs: 2_000,
    perRequestTimeoutMs: 30_000,
  },
  retry: {
    maxAttempts: 3,
    baseBackoffMs: 1_000,
    maxBackoffMs: 30_000,
  },
} as const;

export const ModelPricing = {
  // USD per 1M tokens, current pricing as of 2026-04
  'claude-haiku-4-5-20251001': { input: 1.0, output: 5.0 },
  'claude-sonnet-4-6-20250929': { input: 3.0, output: 15.0 },
} as const;

export type SupportedModel = keyof typeof ModelPricing;
