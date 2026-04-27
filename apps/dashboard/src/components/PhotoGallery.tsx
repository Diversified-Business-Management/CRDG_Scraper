'use client';

import Image from 'next/image';
import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PhotoRow } from '@/lib/types';
import { cn } from '@/lib/utils';

export function PhotoGallery({ photos }: { photos: PhotoRow[] }) {
  const [active, setActive] = useState(0);
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
    <div className="space-y-3">
      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border bg-muted">
        {url && (
          <Image
            src={url}
            alt={alt}
            fill
            sizes="(max-width: 1280px) 100vw, 800px"
            className="object-cover"
            priority
          />
        )}
        {photos.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => setActive((i) => (i - 1 + photos.length) % photos.length)}
              className="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-background"
              aria-label="Previous photo"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => setActive((i) => (i + 1) % photos.length)}
              className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-background"
              aria-label="Next photo"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <div className="absolute bottom-2 right-2 rounded-md bg-background/80 px-2 py-0.5 text-xs font-medium backdrop-blur">
              {active + 1} / {photos.length}
            </div>
          </>
        )}
      </div>
      {photos.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
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
                  <Image
                    src={thumb}
                    alt={`Thumb ${i + 1}`}
                    fill
                    sizes="100px"
                    className="object-cover"
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
