/**
 * Houzez WordPress REST API client.
 * Auth: JWT via the JWT Authentication for WP REST API plugin (tmeister).
 *
 * The plugin's `/jwt-auth/v1/token` endpoint takes username + password and
 * returns a token valid for 7 days. We cache it in-process and refresh on 401.
 */
import { env, logger, Limits } from '@crdg/core';
import { fetch } from 'undici';

let cachedToken: string | null = null;
let cachedTokenAt = 0;
const TOKEN_TTL_MS = 6 * 24 * 60 * 60 * 1000; // refresh after 6 days, plugin issues 7-day tokens

async function getJwtToken(force = false): Promise<string> {
  if (!force && cachedToken && Date.now() - cachedTokenAt < TOKEN_TTL_MS) return cachedToken;
  const wpPassword = process.env.WP_LOGIN_PASSWORD ?? process.env.WP_APP_PASSWORD;
  if (!wpPassword) throw new Error('WP_LOGIN_PASSWORD env var required for JWT auth');
  const url = `${env.wp.baseUrl.replace(/\/+$/, '')}/wp-json/jwt-auth/v1/token`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ username: env.wp.username, password: wpPassword }),
    signal: AbortSignal.timeout(Limits.wp.perRequestTimeoutMs),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`JWT token request failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as { token?: string; user_email?: string };
  if (!json.token) throw new Error('JWT response missing token');
  cachedToken = json.token;
  cachedTokenAt = Date.now();
  logger.info({ user: json.user_email }, 'wp.jwt.token_acquired');
  return cachedToken;
}

interface RequestOpts {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  raw?: boolean;
  headers?: Record<string, string>;
}

async function wpRequest<T = unknown>(path: string, opts: RequestOpts = {}, retryOn401 = true): Promise<T> {
  const url = `${env.wp.baseUrl.replace(/\/+$/, '')}/wp-json${path.startsWith('/') ? '' : '/'}${path}`;
  const token = await getJwtToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    ...(opts.headers ?? {}),
  };
  let body: string | ArrayBuffer | undefined;
  if (opts.body !== undefined) {
    if (opts.raw) {
      body = opts.body as ArrayBuffer;
    } else {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.body);
    }
  }
  const res = await fetch(url, {
    method: opts.method ?? 'GET',
    headers,
    body: body as never,
    signal: AbortSignal.timeout(Limits.wp.perRequestTimeoutMs),
  });
  const text = await res.text();
  if (!res.ok) {
    if (res.status === 401 && retryOn401) {
      // Token may have expired or rotated; force-refresh and retry once.
      logger.info('wp.jwt.refresh_after_401');
      cachedToken = null;
      return wpRequest<T>(path, opts, false);
    }
    logger.warn({ url, status: res.status, body: text.slice(0, 500) }, 'wp.error');
    const err: Error & { status?: number; body?: string } = new Error(`WP ${res.status}: ${text.slice(0, 200)}`);
    err.status = res.status;
    err.body = text;
    throw err;
  }
  if (text === '') return {} as T;
  try { return JSON.parse(text) as T; } catch { return text as unknown as T; }
}

export const wp = {
  request: wpRequest,

  async ping(): Promise<{ ok: boolean; user?: string; error?: string }> {
    try {
      const r = await wpRequest<{ slug: string; name: string }>('/wp/v2/users/me');
      return { ok: true, user: r.slug };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  },

  async getProperty(id: number) {
    return wpRequest<Record<string, unknown>>(`/wp/v2/properties/${id}?context=edit`);
  },

  /** PUT-style update via REST */
  async updatePropertyMeta(id: number, meta: Record<string, unknown>) {
    return wpRequest<{ id: number }>(`/wp/v2/properties/${id}`, { method: 'POST', body: { meta } });
  },

  async createProperty(data: Record<string, unknown>) {
    return wpRequest<{ id: number; link: string }>(`/wp/v2/properties`, { method: 'POST', body: data });
  },

  async updateProperty(id: number, data: Record<string, unknown>) {
    return wpRequest<{ id: number; link: string }>(`/wp/v2/properties/${id}`, { method: 'POST', body: data });
  },

  async upsertTerm(taxonomy: string, name: string, slug?: string): Promise<{ id: number }> {
    try {
      return await wpRequest<{ id: number }>(`/wp/v2/${taxonomy}`, {
        method: 'POST',
        body: { name, slug: slug ?? name.toLowerCase().replace(/[^a-z0-9]+/g, '-') },
      });
    } catch (e) {
      const err = e as Error & { status?: number; body?: string };
      if (err.status === 400 && err.body?.includes('term_exists')) {
        const found = await wpRequest<Array<{ id: number }>>(`/wp/v2/${taxonomy}?slug=${slug ?? name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`);
        if (found[0]) return found[0];
      }
      throw e;
    }
  },

  async uploadMedia(buffer: Uint8Array, filename: string, mime: string, alt: string): Promise<{ id: number; source_url: string }> {
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
    const r = await wpRequest<{ id: number; source_url: string }>(`/wp/v2/media`, {
      method: 'POST',
      raw: true,
      body: arrayBuffer,
      headers: {
        'Content-Type': mime,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
    if (alt) {
      await wpRequest(`/wp/v2/media/${r.id}`, { method: 'POST', body: { alt_text: alt } });
    }
    return r;
  },
};
