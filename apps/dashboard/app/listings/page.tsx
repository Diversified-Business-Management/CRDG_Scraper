import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getSessionUser } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase/server';
import { ListingCard } from '@/components/ListingCard';
import { FilterSidebar } from '@/components/FilterSidebar';
import { EmptyListings } from '@/components/EmptyListings';
import type { ListingCardRow } from '@/lib/types';
import { Button } from '@/components/ui/Button';

const PAGE_SIZE = 24;

interface SearchParams {
  q?: string;
  region?: string;
  type?: string;
  min_price?: string;
  max_price?: string;
  beds?: string;
  baths?: string;
  features?: string;
  page?: string;
}

export default async function ListingsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? '1') || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const supabase = await createServerSupabase();

  let query = supabase
    .from('v_listings_card')
    .select('*', { count: 'exact' })
    .eq('status', 'active')
    .order('last_seen_at', { ascending: false, nullsFirst: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (sp.q) {
    // Best-effort: ilike on title fields. Full-text search lives in canonical_listings.
    query = query.or(
      `title_en.ilike.%${sp.q}%,title_es.ilike.%${sp.q}%,locality.ilike.%${sp.q}%`
    );
  }
  if (sp.region) {
    query = query.in('region_slug', sp.region.split(',').filter(Boolean));
  }
  if (sp.type) {
    query = query.in('property_type', sp.type.split(',').filter(Boolean));
  }
  if (sp.min_price) {
    query = query.gte('price_usd', Number(sp.min_price));
  }
  if (sp.max_price) {
    query = query.lte('price_usd', Number(sp.max_price));
  }
  if (sp.beds) {
    query = query.gte('bedrooms', Number(sp.beds));
  }
  if (sp.baths) {
    query = query.gte('bathrooms', Number(sp.baths));
  }
  if (sp.features) {
    const features = sp.features.split(',').filter(Boolean);
    if (features.length > 0) {
      query = query.contains('features', features);
    }
  }

  const { data, count, error } = await query;

  const rows = (data ?? []) as ListingCardRow[];
  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // Build base query string for pagination preservation
  const baseParams = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k !== 'page' && v) baseParams.set(k, v);
  }
  const paramStr = baseParams.toString();

  return (
    <div className="container py-8">
      <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
        <FilterSidebar />
        <div>
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Listings</h1>
              <p className="text-sm text-muted-foreground">
                {error
                  ? 'Could not load listings.'
                  : totalCount === 0
                    ? 'No active listings yet.'
                    : `${totalCount.toLocaleString()} active listing${totalCount === 1 ? '' : 's'}`}
              </p>
            </div>
          </div>

          {error && (
            <div className="crdg-card border-destructive/40 p-4 text-sm text-destructive">
              {error.message}
            </div>
          )}

          {!error && rows.length === 0 && <EmptyListings role={user.role} />}

          {rows.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {rows.map((row) => (
                <ListingCard key={row.id} row={row} />
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-2">
              <Button asChild variant="outline" size="sm" disabled={page <= 1}>
                <Link
                  href={`/listings?${paramStr ? paramStr + '&' : ''}page=${Math.max(1, page - 1)}`}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Link>
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button asChild variant="outline" size="sm" disabled={page >= totalPages}>
                <Link
                  href={`/listings?${paramStr ? paramStr + '&' : ''}page=${Math.min(totalPages, page + 1)}`}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
