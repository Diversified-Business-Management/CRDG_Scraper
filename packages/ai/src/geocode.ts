/**
 * Mapbox geocoding — converts an address string into lat/lng + components.
 *
 * Cached in-memory by query string, since multiple listings in the same town
 * geocode to nearly the same coordinates and we don't want to pay for them
 * repeatedly within a single run.
 */
import { logger } from '@crdg/core';

interface GeocodeResult {
  lat: number;
  lng: number;
  confidence: 'exact' | 'block' | 'neighborhood' | 'region';
  matched_address: string;
}

const cache = new Map<string, GeocodeResult | null>();

const TOKEN = process.env['MAPBOX_TOKEN'];

export async function geocodeCRAddress(parts: {
  address_line?: string | null;
  locality?: string | null;
  district?: string | null;
  canton?: string | null;
  province?: string | null;
}): Promise<GeocodeResult | null> {
  if (!TOKEN) return null;

  // Build query from most-specific to least
  const segments = [
    parts.address_line,
    parts.locality,
    parts.district,
    parts.canton,
    parts.province,
    'Costa Rica',
  ].filter(Boolean) as string[];
  if (segments.length < 2) return null;

  const query = segments.join(', ');
  const cached = cache.get(query);
  if (cached !== undefined) return cached;

  try {
    const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`);
    url.searchParams.set('access_token', TOKEN);
    url.searchParams.set('country', 'cr');
    url.searchParams.set('limit', '1');
    url.searchParams.set('types', 'address,place,locality,neighborhood,region');

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      logger.warn({ status: res.status, query }, 'geocode.fail');
      cache.set(query, null);
      return null;
    }
    const json = await res.json() as { features?: Array<{ center?: [number, number]; place_name?: string; place_type?: string[] }> };
    const f = json.features?.[0];
    if (!f?.center) {
      cache.set(query, null);
      return null;
    }
    const [lng, lat] = f.center;
    // Sanity: must be inside CR bbox
    if (lat < 7.5 || lat > 12 || lng < -86.5 || lng > -82) {
      cache.set(query, null);
      return null;
    }
    const placeType = f.place_type?.[0] ?? '';
    const confidence: GeocodeResult['confidence'] =
      placeType === 'address' ? 'exact' :
      placeType === 'neighborhood' ? 'neighborhood' :
      placeType === 'place' || placeType === 'locality' ? 'block' :
      'region';
    const result: GeocodeResult = { lat, lng, confidence, matched_address: f.place_name ?? query };
    cache.set(query, result);
    return result;
  } catch (e) {
    logger.warn({ err: (e as Error).message, query }, 'geocode.error');
    cache.set(query, null);
    return null;
  }
}
