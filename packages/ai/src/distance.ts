/**
 * Distance computation: takes a listing's lat/lng and resolves nearest
 * airport, hospital, school, beach from the cr_* reference tables.
 *
 * Uses haversine in pure SQL via pg's <=> operator on point types if available;
 * otherwise computes in JS for portability.
 */
import { pgQuery } from '@crdg/core';

type Ref = { id?: string; code?: string; name: string; lat: number; lng: number };

export interface DistanceResult {
  distance_to_beach_km: number | null;
  distance_to_airport_km: number | null;
  nearest_airport_code: string | null;
  distance_to_hospital_km: number | null;
  nearest_hospital_name: string | null;
  distance_to_school_km: number | null;
  nearest_school_name: string | null;
}

/** Haversine distance in km between two lat/lng pairs. */
export function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Find nearest reference within `maxKm` (returns {ref, distance} or null). */
function nearest(
  origin: { lat: number; lng: number },
  refs: Ref[],
  maxKm = 200,
): { ref: Ref; km: number } | null {
  let best: { ref: Ref; km: number } | null = null;
  for (const r of refs) {
    const km = haversineKm(origin.lat, origin.lng, r.lat, r.lng);
    if (km > maxKm) continue;
    if (!best || km < best.km) best = { ref: r, km };
  }
  return best;
}

let cache: { airports: Ref[]; hospitals: Ref[]; schools: Ref[]; beaches: Ref[] } | null = null;
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 60 * 60 * 1000;

async function loadRefs() {
  if (cache && Date.now() - cacheLoadedAt < CACHE_TTL_MS) return cache;
  const [airports, hospitals, schools, beaches] = await Promise.all([
    pgQuery<{ code: string; name: string; lat: string; lng: string }>(
      'select code, name, lat::text, lng::text from cr_airports',
    ),
    pgQuery<{ name: string; lat: string; lng: string }>(
      'select name, lat::text, lng::text from cr_hospitals',
    ),
    pgQuery<{ name: string; lat: string; lng: string }>(
      "select name, lat::text, lng::text from cr_schools where level in ('international','elementary','secondary')",
    ),
    pgQuery<{ name: string; lat: string; lng: string }>(
      'select name, lat::text, lng::text from cr_beaches',
    ),
  ]);
  cache = {
    airports: airports.map(r => ({ code: r.code, name: r.name, lat: Number(r.lat), lng: Number(r.lng) })),
    hospitals: hospitals.map(r => ({ name: r.name, lat: Number(r.lat), lng: Number(r.lng) })),
    schools: schools.map(r => ({ name: r.name, lat: Number(r.lat), lng: Number(r.lng) })),
    beaches: beaches.map(r => ({ name: r.name, lat: Number(r.lat), lng: Number(r.lng) })),
  };
  cacheLoadedAt = Date.now();
  return cache;
}

/** Compute distances for a listing. lat/lng must be valid CR coords. */
export async function computeDistances(
  origin: { lat: number; lng: number } | null | undefined,
): Promise<DistanceResult> {
  const empty: DistanceResult = {
    distance_to_beach_km: null,
    distance_to_airport_km: null,
    nearest_airport_code: null,
    distance_to_hospital_km: null,
    nearest_hospital_name: null,
    distance_to_school_km: null,
    nearest_school_name: null,
  };
  if (!origin || origin.lat == null || origin.lng == null) return empty;
  // Sanity check: must be inside Costa Rica's bounding box
  if (origin.lat < 7.5 || origin.lat > 12 || origin.lng < -86.5 || origin.lng > -82) {
    return empty;
  }
  const refs = await loadRefs();

  const air = nearest(origin, refs.airports);
  const hosp = nearest(origin, refs.hospitals);
  const sch = nearest(origin, refs.schools);
  const bch = nearest(origin, refs.beaches);

  return {
    distance_to_airport_km: air ? round1(air.km) : null,
    nearest_airport_code: air?.ref.code ?? null,
    distance_to_hospital_km: hosp ? round1(hosp.km) : null,
    nearest_hospital_name: hosp?.ref.name ?? null,
    distance_to_school_km: sch ? round1(sch.km) : null,
    nearest_school_name: sch?.ref.name ?? null,
    distance_to_beach_km: bch ? round1(bch.km) : null,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
