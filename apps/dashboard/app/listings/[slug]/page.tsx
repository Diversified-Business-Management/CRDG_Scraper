import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, BedDouble, Bath, Ruler, Calendar, MapPin } from 'lucide-react';
import { getSessionUser } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase/server';
import { PhotoGallery } from '@/components/PhotoGallery';
import { Map } from '@/components/Map';
import { ListingEditPanel } from '@/components/ListingEditPanel';
import { ListingCard } from '@/components/ListingCard';
import { Badge } from '@/components/ui/Badge';
import {
  cn,
  formatNumber,
  formatUsd,
  regionLabel,
  statusColor,
} from '@/lib/utils';
import type {
  AgentRow,
  CanonicalListingRow,
  ListingCardRow,
  PhotoRow,
} from '@/lib/types';

export default async function ListingDetail({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const { slug } = await params;
  const supabase = await createServerSupabase();

  const { data: listing, error } = await supabase
    .from('canonical_listings')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (error || !listing) {
    notFound();
  }

  const c = listing as CanonicalListingRow;

  const { data: photoRows } = await supabase
    .from('photos')
    .select('id, canonical_listing_id, url_source, url_supabase, position, is_hero, alt_text_en, alt_text_es, width, height')
    .eq('canonical_listing_id', c.id)
    .order('position', { ascending: true });

  const { data: agentRows } = await supabase
    .from('agents')
    .select('id, email, name, phone, enabled')
    .eq('enabled', true)
    .order('name');

  // Best-effort similar listings
  let similar: ListingCardRow[] = [];
  try {
    const { data } = await supabase
      .from('v_listings_card')
      .select('*')
      .eq('status', 'active')
      .neq('id', c.id)
      .eq('region_slug', c.region_slug)
      .limit(6);
    similar = (data ?? []) as ListingCardRow[];
  } catch {
    similar = [];
  }

  const title = c.title_en ?? c.title_es ?? `Listing ${c.slug}`;
  const photos = (photoRows ?? []) as PhotoRow[];
  const agents = (agentRows ?? []) as AgentRow[];

  return (
    <div className="container py-8">
      <Link
        href="/listings"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to listings
      </Link>

      <div className="mt-4 grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  'rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                  statusColor(c.status)
                )}
              >
                {c.status.replace('_', ' ')}
              </span>
              {c.property_type && <Badge variant="outline">{c.property_type}</Badge>}
              {c.region_slug && <Badge variant="secondary">{regionLabel(c.region_slug)}</Badge>}
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
            <p className="font-mono text-3xl font-semibold tabular-nums">
              {formatUsd(c.price_usd)}
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {c.bedrooms != null && (
                <span className="inline-flex items-center gap-1">
                  <BedDouble className="h-4 w-4" />
                  {formatNumber(c.bedrooms)} beds
                </span>
              )}
              {c.bathrooms != null && (
                <span className="inline-flex items-center gap-1">
                  <Bath className="h-4 w-4" />
                  {formatNumber(c.bathrooms)} baths
                </span>
              )}
              {c.interior_sqm != null && (
                <span className="inline-flex items-center gap-1">
                  <Ruler className="h-4 w-4" />
                  {formatNumber(c.interior_sqm)} m² interior
                </span>
              )}
              {c.lot_sqm != null && (
                <span className="inline-flex items-center gap-1">
                  <Ruler className="h-4 w-4" />
                  {formatNumber(c.lot_sqm)} m² lot
                </span>
              )}
              {c.year_built != null && (
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  Built {c.year_built}
                </span>
              )}
            </div>
          </div>

          <PhotoGallery photos={photos} />

          {c.description_en && (
            <div className="crdg-card p-6">
              <h2 className="text-lg font-semibold tracking-tight">Description</h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {c.description_en}
              </p>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Section title="Location">
              <KV k="Region" v={regionLabel(c.region_slug)} />
              <KV k="Province" v={c.province} />
              <KV k="Canton" v={c.canton} />
              <KV k="District" v={c.district} />
              <KV k="Locality" v={c.locality} />
              <KV k="Address" v={c.address_line} />
              {c.lat != null && c.lng != null && (
                <KV
                  k="Coords"
                  v={
                    <span className="font-mono">
                      {Number(c.lat).toFixed(4)}, {Number(c.lng).toFixed(4)}
                    </span>
                  }
                />
              )}
            </Section>
            <Section title="Pricing & dimensions">
              <KV k="Price (raw)" v={c.price ? `${c.price_currency ?? 'USD'} ${formatNumber(c.price)}` : null} />
              <KV k="Price USD" v={formatUsd(c.price_usd)} />
              <KV k="Price / m²" v={c.price_per_sqm ? formatUsd(c.price_per_sqm) : null} />
              <KV k="HOA / mo" v={c.hoa_fee_usd ? formatUsd(c.hoa_fee_usd) : null} />
              <KV k="Taxes / yr" v={c.taxes_usd_annual ? formatUsd(c.taxes_usd_annual) : null} />
              <KV k="MLS ID" v={c.mls_id ? <span className="font-mono">{c.mls_id}</span> : null} />
              <KV k="Listed" v={c.listed_at ? new Date(c.listed_at).toLocaleDateString() : null} />
            </Section>
          </div>

          {c.lat != null && c.lng != null && (
            <Section title="Map">
              <Map lat={Number(c.lat)} lng={Number(c.lng)} />
            </Section>
          )}

          {(c.features?.length || c.tags_ai?.length || c.tags_human?.length) ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <ChipGroup title="Features" chips={c.features ?? []} />
              <ChipGroup title="AI tags" chips={c.tags_ai ?? []} variant="accent" />
              <ChipGroup title="Human tags" chips={c.tags_human ?? []} variant="secondary" />
            </div>
          ) : null}

          {similar.length > 0 && (
            <div>
              <h2 className="mb-3 text-lg font-semibold tracking-tight">Similar listings</h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {similar.map((r) => (
                  <ListingCard key={r.id} row={r} />
                ))}
              </div>
            </div>
          )}

          {user.role === 'admin' && (
            <details className="crdg-card p-4 text-sm">
              <summary className="cursor-pointer font-medium">Admin trace</summary>
              <div className="mt-3 grid gap-1 text-xs text-muted-foreground">
                <KV k="Canonical ID" v={<span className="font-mono">{c.id}</span>} />
                <KV k="Slug" v={<span className="font-mono">{c.slug}</span>} />
                <KV k="WP post" v={c.wp_post_id ? `#${c.wp_post_id}` : 'unsynced'} />
                <KV k="Last seen" v={c.last_seen_at ? new Date(c.last_seen_at).toISOString() : null} />
                <KV k="Confidence" v={c.confidence != null ? c.confidence.toFixed(2) : null} />
                <KV k="Updated" v={new Date(c.updated_at).toISOString()} />
              </div>
            </details>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <ListingEditPanel
            slug={c.slug}
            initialTags={c.tags_human ?? []}
            initialAgentId={c.agent_id}
            agents={agents}
          />
          <div className="crdg-card p-4">
            <h3 className="text-sm font-semibold">Quick facts</h3>
            <div className="mt-3 grid gap-1 text-xs">
              {c.locality && (
                <KV
                  k=""
                  v={
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {c.locality}, {c.canton ?? c.province ?? ''}
                    </span>
                  }
                />
              )}
              <KV k="Type" v={c.property_type} />
              <KV k="Status" v={c.status} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="crdg-card p-6">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="mt-3 grid gap-1.5 text-sm">{children}</div>
    </div>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  if (v === null || v === undefined || v === '') return null;
  return (
    <div className="grid grid-cols-[110px_1fr] items-baseline gap-2 text-sm">
      {k && <span className="text-xs text-muted-foreground">{k}</span>}
      <span>{v}</span>
    </div>
  );
}

function ChipGroup({
  title,
  chips,
  variant = 'outline',
}: {
  title: string;
  chips: string[];
  variant?: 'outline' | 'accent' | 'secondary';
}) {
  if (!chips || chips.length === 0) return null;
  const cls =
    variant === 'accent'
      ? 'border-accent/30 bg-accent/10 text-accent-foreground/80'
      : variant === 'secondary'
        ? 'border-transparent bg-secondary text-secondary-foreground'
        : 'bg-background';
  return (
    <div className="crdg-card p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <span
            key={c}
            className={cn(
              'rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
              cls
            )}
          >
            {c.replace(/_/g, ' ')}
          </span>
        ))}
      </div>
    </div>
  );
}
