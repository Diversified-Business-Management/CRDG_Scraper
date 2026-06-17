/**
 * Download → resize → upload to WP Media Library.
 */
import { fetch } from 'undici';
import sharp from 'sharp';
import { logger, Limits } from '@crdg/core';
import { wp } from './wp-client.js';

const PHOTO_TIMEOUT_MS = 20_000;

export interface PhotoUploadInput {
  url_source: string;
  alt: string;
  filename?: string;
}

export async function ensurePhotoUploaded(input: PhotoUploadInput): Promise<{ wp_media_id: number; source_url: string; width: number; height: number }> {
  const downloadStart = Date.now();
  const res = await fetch(input.url_source, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CRDG-Bot/1.0)' },
    signal: AbortSignal.timeout(PHOTO_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`photo download ${res.status} for ${input.url_source}`);
  const buf = Buffer.from(await res.arrayBuffer());

  // Resize + re-encode to WebP
  const image = sharp(buf, { failOn: 'none' }).rotate();
  const meta = await image.metadata();
  const maxEdge = Limits.photos.maxEdgePx;
  const needsResize = (meta.width ?? 0) > maxEdge || (meta.height ?? 0) > maxEdge;
  let pipeline = image;
  if (needsResize) pipeline = pipeline.resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true });
  const out = await pipeline.webp({ quality: Math.round(Limits.photos.quality * 100) }).toBuffer({ resolveWithObject: true });

  const filename = input.filename ?? deriveFilename(input.url_source);
  const upload = await wp.uploadMedia(out.data, filename.replace(/\.[^.]+$/, '') + '.webp', 'image/webp', input.alt);
  logger.debug({ url: input.url_source, wpId: upload.id, durationMs: Date.now() - downloadStart }, 'photo.uploaded');
  return {
    wp_media_id: upload.id,
    source_url: upload.source_url,
    width: out.info.width,
    height: out.info.height,
  };
}

function deriveFilename(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').filter(Boolean).pop() ?? 'photo';
    const base: string = last.split('?')[0] ?? 'photo';
    return base.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80);
  } catch {
    return `photo-${Date.now()}.webp`;
  }
}
