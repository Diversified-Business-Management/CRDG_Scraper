import { format } from 'date-fns';
import { createServerSupabase } from '@/lib/supabase/server';
import { DedupRow } from './DedupRow';
import type { DedupLinkRow } from '@/lib/types';

export default async function DedupPage() {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase
    .from('dedup_links')
    .select('id, canonical_listing_id, raw_listing_id, confidence, method, reason, reviewed_at, created_at')
    .is('reviewed_at', null)
    .gte('confidence', 0.6)
    .lte('confidence', 0.85)
    .order('confidence', { ascending: false })
    .limit(50);

  const links = (data ?? []) as DedupLinkRow[];

  // Pre-fetch related canonical & raw listings
  const canonicalIds = links.map((l) => l.canonical_listing_id);
  const rawIds = links.map((l) => l.raw_listing_id);

  const [{ data: canonicals }, { data: raws }] = await Promise.all([
    canonicalIds.length
      ? supabase
          .from('canonical_listings')
          .select('id, slug, title_en, title_es, price_usd, locality, region_slug, bedrooms, bathrooms, interior_sqm, lot_sqm')
          .in('id', canonicalIds)
      : Promise.resolve({ data: [] }),
    rawIds.length
      ? supabase
          .from('raw_listings')
          .select('id, source_url, source_id, normalized')
          .in('id', rawIds)
      : Promise.resolve({ data: [] }),
  ]);

  type CanonicalLite = {
    id: string;
    slug: string;
    title_en: string | null;
    title_es: string | null;
    price_usd: number | null;
    locality: string | null;
    region_slug: string | null;
    bedrooms: number | null;
    bathrooms: number | null;
    interior_sqm: number | null;
    lot_sqm: number | null;
  };
  type RawLite = {
    id: string;
    source_url: string;
    source_id: string;
    normalized: Record<string, unknown> | null;
  };
  const canonicalById = new Map(
    ((canonicals ?? []) as CanonicalLite[]).map((c) => [c.id, c])
  );
  const rawById = new Map(((raws ?? []) as RawLite[]).map((r) => [r.id, r]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dedup review queue</h1>
        <p className="text-sm text-muted-foreground">
          Pairs with confidence between 0.60 and 0.85 — accept or reject.
        </p>
      </div>

      {error && (
        <div className="crdg-card border-destructive/40 p-4 text-sm text-destructive">
          {error.message}
        </div>
      )}

      {links.length === 0 ? (
        <div className="crdg-card p-8 text-center text-sm text-muted-foreground">
          Queue is empty. Nice work.
        </div>
      ) : (
        <div className="space-y-3">
          {links.map((l) => (
            <DedupRow
              key={l.id}
              linkId={l.id}
              confidence={l.confidence}
              method={l.method}
              reason={l.reason}
              createdAt={format(new Date(l.created_at), 'PPpp')}
              canonical={canonicalById.get(l.canonical_listing_id) ?? null}
              raw={rawById.get(l.raw_listing_id) ?? null}
            />
          ))}
        </div>
      )}
    </div>
  );
}
