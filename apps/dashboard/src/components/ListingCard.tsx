import Image from 'next/image';
import Link from 'next/link';
import { BedDouble, Bath, Ruler, MapPin } from 'lucide-react';
import type { ListingCardRow } from '@/lib/types';
import { Badge } from '@/components/ui/Badge';
import { cn, formatNumber, formatUsd, regionLabel, statusColor } from '@/lib/utils';

export function ListingCard({ row }: { row: ListingCardRow }) {
  const photo = row.hero_url ?? row.fallback_url;
  const title = row.title_en ?? row.title_es ?? `Listing ${row.slug}`;
  const region = regionLabel(row.region_slug);

  return (
    <Link
      href={`/listings/${row.slug}`}
      className="group crdg-card overflow-hidden transition-all hover:shadow-md hover:-translate-y-0.5"
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-muted">
        {photo ? (
          <Image
            src={photo}
            alt={title}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
            No photo yet
          </div>
        )}
        <div className="absolute left-2 top-2 flex gap-1.5">
          <span
            className={cn(
              'rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
              statusColor(row.status)
            )}
          >
            {row.status.replace('_', ' ')}
          </span>
          {row.property_type && (
            <span className="rounded-md border bg-background/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide backdrop-blur">
              {row.property_type}
            </span>
          )}
        </div>
      </div>
      <div className="p-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-mono text-lg font-semibold tabular-nums">
            {formatUsd(row.price_usd, { compact: true })}
          </p>
          {row.region_slug && (
            <Badge variant="outline" className="text-[10px]">
              {region}
            </Badge>
          )}
        </div>
        <h3 className="mt-1 line-clamp-2 text-sm font-medium leading-snug">{title}</h3>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {row.bedrooms != null && (
            <span className="inline-flex items-center gap-1">
              <BedDouble className="h-3.5 w-3.5" />
              {formatNumber(row.bedrooms)} bd
            </span>
          )}
          {row.bathrooms != null && (
            <span className="inline-flex items-center gap-1">
              <Bath className="h-3.5 w-3.5" />
              {formatNumber(row.bathrooms)} ba
            </span>
          )}
          {row.interior_sqm != null && (
            <span className="inline-flex items-center gap-1">
              <Ruler className="h-3.5 w-3.5" />
              {formatNumber(row.interior_sqm)} m²
            </span>
          )}
          {row.locality && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {row.locality}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
