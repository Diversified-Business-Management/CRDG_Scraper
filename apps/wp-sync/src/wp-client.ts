/**
 * Houzez WordPress REST API client.
 * Auth: Application Password (Basic auth).
 */
import { env, logger, Limits } from '@crdg/core';
import { fetch } from 'undici';

const auth = 'Basic ' + Buffer.from(`${env.wp.username}:${env.wp.appPassword.replace(/\s/g, '')}`).toString('base64');

interface RequestOpts {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  raw?: boolean;
  headers?: Record<string, string>;
}

async function wpRequest<T = unknown>(path: string, opts: RequestOpts = {}): Promise<T> {
  const url = `${env.wp.baseUrl.replace(/\/+$/, '')}/wp-json${path.startsWith('/') ? '' : '/'}${path}`;
  const headers: Record<string, string> = {
    Authorization: auth,
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
