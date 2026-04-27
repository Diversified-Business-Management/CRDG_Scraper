/**
 * Lazy loader for source adapters. Adapters live in @crdg/adapters; this layer
 * lets the worker survive even if some adapter modules don't exist yet
 * (e.g. during initial scaffolding).
 */
import { logger } from '@crdg/core';
import type { SourceAdapter } from '@crdg/core';

export async function resolveAdapter(slug: string): Promise<SourceAdapter> {
  try {
    const mod = (await import('@crdg/adapters')) as unknown as Record<string, unknown>;
    const registry = mod.getAdapter as ((s: string) => SourceAdapter | undefined) | undefined;
    if (registry) {
      const a = registry(slug);
      if (a) return a;
    }
    const direct = mod[slug];
    if (direct && typeof (direct as SourceAdapter).fetchListing === 'function') return direct as SourceAdapter;
    throw new Error(`Adapter "${slug}" not exported by @crdg/adapters`);
  } catch (e) {
    logger.error({ slug, err: (e as Error).message }, 'adapter.resolve_failed');
    throw e;
  }
}
