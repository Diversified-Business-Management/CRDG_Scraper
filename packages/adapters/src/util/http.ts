/**
 * Shared HTTP client for source adapters.
 *
 * - Uses undici.fetch under the hood
 * - Per-host bottleneck rate limiter (1 rps sustained, burst 3 by default)
 * - Retry with exponential backoff: 3 attempts, 1s base, 30s max
 * - Only retries on 5xx and network errors
 * - 30s default timeout per request
 */

import { fetch, Agent } from 'undici';
import Bottleneck from 'bottleneck';
import { Limits } from '@crdg/core';

// Realistic Chrome UA — partner sites with cloudflare/security plugins reject
// "compatible; bot" UAs, even when our access is contractually authorized.
// We're polite via per-host rate limits and Accept-* headers.
export const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const DEFAULT_TIMEOUT_MS = 30_000;

/** One bottleneck per host so we never starve cross-host work. */
const limitersByHost = new Map<string, Bottleneck>();

export interface RateLimitConfig {
  /** Sustained requests/sec. Defaults to Limits.perSource.sustainedRps (1.0). */
  rps?: number;
  /** Concurrent burst capacity. Defaults to Limits.perSource.burst (3). */
  burst?: number;
}

export function getLimiter(host: string, cfg: RateLimitConfig = {}): Bottleneck {
  const existing = limitersByHost.get(host);
  if (existing) return existing;
  const rps = cfg.rps ?? Limits.perSource.sustainedRps;
  const burst = cfg.burst ?? Limits.perSource.burst;
  const limiter = new Bottleneck({
    minTime: Math.max(1, Math.floor(1000 / rps)),
    maxConcurrent: burst,
    reservoir: burst,
    reservoirRefreshAmount: burst,
    reservoirRefreshInterval: 1000,
  });
  limitersByHost.set(host, limiter);
  return limiter;
}

export interface FetchHtmlOpts {
  /** Override headers (User-Agent always set). */
  headers?: Record<string, string>;
  /** Per-host rate-limit override. */
  rateLimit?: RateLimitConfig;
  /** Per-request timeout in ms. */
  timeoutMs?: number;
  /** Abort signal forwarded to fetch. */
  signal?: AbortSignal;
}

export interface FetchHtmlResult {
  html: string;
  status: number;
  finalUrl: string;
  headers: Record<string, string>;
}

const sharedAgent = new Agent({
  keepAliveTimeout: 10_000,
  keepAliveMaxTimeout: 30_000,
  connect: { timeout: 10_000 },
});

class HttpError extends Error {
  constructor(public status: number, public url: string, body?: string) {
    super(`HTTP ${status} for ${url}${body ? `: ${body.slice(0, 200)}` : ''}`);
  }
}

function shouldRetry(err: unknown): boolean {
  if (err instanceof HttpError) return err.status >= 500;
  // Network / timeout / aborts that aren't user-initiated are retryable.
  if (err instanceof Error) {
    const code = (err as { code?: string }).code;
    if (code && ['ECONNRESET', 'ETIMEDOUT', 'ENETUNREACH', 'ECONNREFUSED', 'EAI_AGAIN', 'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT'].includes(code)) {
      return true;
    }
    if (err.name === 'TimeoutError' || /timeout/i.test(err.message)) return true;
  }
  return false;
}

function backoffMs(attempt: number): number {
  const base = Limits.retry.baseBackoffMs;
  const max = Limits.retry.maxBackoffMs;
  const exp = Math.min(max, base * 2 ** (attempt - 1));
  // Add small jitter so retries don't synchronize across listings.
  return Math.floor(exp * (0.75 + Math.random() * 0.5));
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Aborted'));
    const t = setTimeout(resolve, ms);
    if (signal) {
      const onAbort = () => {
        clearTimeout(t);
        reject(new Error('Aborted'));
      };
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

export async function fetchHtml(url: string, opts: FetchHtmlOpts = {}): Promise<FetchHtmlResult> {
  const u = new URL(url);
  const limiter = getLimiter(u.host, opts.rateLimit);

  return limiter.schedule(async () => {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= Limits.retry.maxAttempts; attempt++) {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      const externalSignal = opts.signal;
      const onExternalAbort = () => ac.abort();
      if (externalSignal) {
        if (externalSignal.aborted) ac.abort();
        else externalSignal.addEventListener('abort', onExternalAbort, { once: true });
      }
      try {
        const res = await fetch(url, {
          method: 'GET',
          dispatcher: sharedAgent,
          signal: ac.signal,
          redirect: 'follow',
          headers: {
            'User-Agent': USER_AGENT,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9,es;q=0.8',
            ...opts.headers,
          },
        });
        if (res.status >= 500) {
          const body = await res.text().catch(() => '');
          throw new HttpError(res.status, url, body);
        }
        const html = await res.text();
        const headers: Record<string, string> = {};
        res.headers.forEach((v, k) => { headers[k] = v; });
        return { html, status: res.status, finalUrl: res.url || url, headers };
      } catch (err) {
        lastErr = err;
        if (!shouldRetry(err) || attempt === Limits.retry.maxAttempts) {
          throw err;
        }
        await sleep(backoffMs(attempt), externalSignal);
      } finally {
        clearTimeout(timer);
        if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
      }
    }
    // Unreachable, but TS likes it.
    throw lastErr instanceof Error ? lastErr : new Error('fetchHtml: unknown error');
  });
}
