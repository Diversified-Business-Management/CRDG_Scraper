/**
 * Daily-cached FX rates. Source: open.er-api.com (free, no auth).
 * Falls back to a hardcoded recent rate if the API is down.
 */
import { logger } from './logger.js';

const FALLBACK = { CRC: 540, USD: 1 } as const; // Costa Rican Colon per USD, approx
let cache: { rates: Record<string, number>; fetchedAt: number } | null = null;
const TTL_MS = 24 * 60 * 60 * 1000;

export async function getRates(): Promise<Record<string, number>> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache.rates;
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`fx http ${res.status}`);
    const json = await res.json() as { rates: Record<string, number> };
    cache = { rates: json.rates, fetchedAt: Date.now() };
    return json.rates;
  } catch (e) {
    logger.warn({ err: (e as Error).message }, 'fx.fallback');
    return { ...FALLBACK };
  }
}

export async function toUsd(amount: number, currency: string): Promise<number> {
  if (currency === 'USD') return amount;
  const rates = await getRates();
  const rate = rates[currency];
  if (!rate) throw new Error(`Unknown currency ${currency}`);
  return amount / rate;
}
