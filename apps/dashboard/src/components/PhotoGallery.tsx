'use client';

import Image from 'next/image';
import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, X, Expand } from 'lucide-react';
import type { PhotoRow } from '@/lib/types';
import { cn } from '@/lib/utils';

export function PhotoGallery({ photos }: { photos: PhotoRow[] }) {
  const [active, setActive] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const next = useCallback(() => setActive((i) => (i + 1) % photos.length), [photos.length]);
  const prev = useCallback(() => setActive((i) => (i - 1 + photos.length) % photos.length), [photos.length]);

  // Keyboard nav inside lightbox: ← / → / Esc
  useEffect(() => {
    if (!lightboxOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxOpen(false);
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [lightboxOpen, next, prev]);

  if (!photos.length) {
    return (
      <div className="aspect-[16/10] w-full rounded-xl border bg-muted flex items-center justify-center text-sm text-muted-foreground">
        No photos
      </div>
    );
  }

  const current = photos[active];
  const url = current?.url_supabase ?? current?.url_source;
  const alt = current?.alt_text_en ?? current?.alt_text_es ?? `Photo ${active + 1}`;

  return (
    <>
      {/* In-page gallery — capped at ~960×600 */}
      <div className="space-y-3">
        <div
          className="group relative mx-auto aspect-[16/10] w-full max-w-[960px] cursor-zoom-in overflow-hidden rounded-xl border bg-muted"
          onClick={() => setLightboxOpen(true)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter') setLightboxOpen(true); }}
          aria-label="Click to view full size"
        >
          {url && (
            <Image
              src={url}
              alt={alt}
              fill
              sizes="(max-width: 1024px) 100vw, 960px"
              className="object-cover"
              priority
            />
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-end gap-2 bg-gradient-to-t from-black/40 to-transparent p-3 opacity-0 transition-opacity group-hover:opacity-100">
            <span className="rounded-md bg-background/80 px-2 py-0.5 text-xs font-medium backdrop-blur">
              <Expand className="mr-1 inline h-3 w-3" />
              Click to expand
            </span>
          </div>
          {photos.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); prev(); }}
                className="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-background"
                aria-label="Previous photo"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); next(); }}
                className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-background"
                aria-label="Next photo"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
              <div className="absolute bottom-2 left-2 rounded-md bg-background/80 px-2 py-0.5 text-xs font-medium backdrop-blur">
                {active + 1} / {photos.length}
              </div>
            </>
          )}
        </div>

        {/* Thumbnail strip */}
        {photos.length > 1 && (
          <div className="mx-auto flex max-w-[960px] gap-2 overflow-x-auto pb-1">
            {photos.map((p, i) => {
              const thumb = p.url_supabase ?? p.url_source;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setActive(i)}
                  className={cn(
                    'relative h-16 w-24 flex-shrink-0 overflow-hidden rounded-md border-2 transition-colors',
                    i === active ? 'border-accent' : 'border-transparent opacity-70 hover:opacity-100'
                  )}
                >
                  {thumb && (
                    <Image src={thumb} alt={`Thumb ${i + 1}`} fill sizes="100px" className="object-cover" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Lightbox — full viewport, up to native resolution */}
      {lightboxOpen && url && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={() => setLightboxOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setLightboxOpen(false); }}
            className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="relative h-[90vh] w-[95vw] max-w-[1600px]" onClick={(e) => e.stopPropagation()}>
            <Image
              src={url}
              alt={alt}
              fill
              sizes="100vw"
              className="object-contain"
              priority
            />
            {photos.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={prev}
                  className="absolute left-2 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20"
                  aria-label="Previous"
                >
                  <ChevronLeft className="h-7 w-7" />
                </button>
                <button
                  type="button"
                  onClick={next}
                  className="absolute right-2 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20"
                  aria-label="Next"
                >
                  <ChevronRight className="h-7 w-7" />
                </button>
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md bg-white/10 px-3 py-1 text-sm text-white backdrop-blur">
                  {active + 1} / {photos.length}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
