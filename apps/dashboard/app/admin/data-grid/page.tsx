/**
 * Admin data grid — every canonical_listings row + selected joined fields,
 * presented as a wide horizontally-scrollable table for internal QA.
 */
import Link from 'next/link';
import { Pencil } from 'lucide-react';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { formatNumber, formatUsd } from '@/lib/utils';
import { NewListingButton } from './NewListingButton';

const FIELD_GROUPS: Array<{ label: string; fields: string[] }> = [
  { label: 'Identity', fields: ['slug', 'status', 'property_type', 'listing_type', 'mls_id', 'mls_status'] },
  { label: 'Title / Copy', fields: ['title_en', 'title_es', 'description_en', 'notes'] },
  { label: 'Pricing', fields: ['price', 'price_currency', 'price_usd', 'price_per_sqm', 'list_price_original_usd', 'previous_list_price_usd', 'sold_price_usd', 'hoa_fee_usd', 'hoa_fee_frequency', 'taxes_usd_annual', 'tax_year', 'estimated_closing_usd', 'rental_income_potential', 'luxury_tax_yn'] },
  { label: 'Dimensions', fields: ['bedrooms', 'bathrooms', 'bathrooms_full', 'bathrooms_half', 'bathrooms_total', 'interior_sqm', 'lot_sqm', 'year_built', 'year_renovated', 'stories_total', 'floor_number', 'total_floors_in_bldg', 'parking_spaces', 'garage_spaces'] },
  { label: 'Construction & condition', fields: ['construction_status', 'condition', 'architectural_style'] },
  { label: 'Location', fields: ['region_slug', 'province', 'canton', 'district', 'locality', 'address_line', 'postal_code', 'country', 'community_name', 'building_name', 'gated_community', 'lat', 'lng', 'geocode_confidence'] },
  { label: 'Distances', fields: ['distance_to_beach_km', 'distance_to_airport_km', 'nearest_airport_code', 'distance_to_hospital_km', 'nearest_hospital_name', 'distance_to_school_km', 'nearest_school_name', 'distance_to_grocery_km', 'school_district', 'elementary_school', 'secondary_school'] },
  { label: 'View / pool / waterfront', fields: ['view_types', 'pool_features', 'waterfront_yn', 'waterfront_features', 'beachfront_yn'] },
  { label: 'Amenities', fields: ['features', 'interior_features', 'exterior_features', 'parking_features', 'appliances', 'flooring', 'cooling', 'heating', 'furnishings_included', 'hoa_amenities', 'hoa_name'] },
  { label: 'Costa Rica legal/utilities', fields: ['title_status', 'maritime_zone', 'foreigner_buyable', 'road_access', 'water_source', 'electricity', 'internet_quality', 'zoning'] },
  { label: 'Tags', fields: ['tags_ai', 'tags_human'] },
  { label: 'Lifecycle', fields: ['listed_at', 'last_seen_at', 'days_on_market', 'under_contract', 'sold_at', 'confidence', 'realtor_review_status', 'internal_quality_score'] },
  { label: 'Agent / brokerage', fields: ['listing_agent_name', 'listing_agent_phone', 'listing_agent_email', 'source_brokerage', 'source_brokerage_phone', 'agent_id'] },
  { label: 'Source / WP', fields: ['primary_source_url', 'wp_post_id', 'wp_synced_at', 'photo_count', 'virtual_tour_url', 'video_url', 'floorplan_url'] },
  { label: 'Catch-all', fields: ['extra_data', 'realtor_review_notes'] },
];

const ALL_FIELDS = ['id', ...FIELD_GROUPS.flatMap(g => g.fields), 'created_at', 'updated_at'];

export const dynamic = 'force-dynamic';

export default async function DataGridPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; group?: string }>;
}) {
  const sp = await searchParams;
  const supabase = createAdminSupabase();

  const { data: rowsData, error } = await supabase
    .from('canonical_listings')
    .select(ALL_FIELDS.join(','))
    .order('created_at', { ascending: false })
    .limit(500);

  const rows = (rowsData ?? []) as unknown as Array<Record<string, unknown>>;

  // Highlight a single field group via ?group=Pricing
  const activeGroup =
    sp.group && FIELD_GROUPS.find(g => g.label === sp.group)
      ? FIELD_GROUPS.find(g => g.label === sp.group)!
      : null;

  const visibleFields = activeGroup
    ? ['__edit', 'slug', ...activeGroup.fields]
    : ['__edit', ...ALL_FIELDS.filter(f => !['id', 'created_at', 'updated_at', 'description_en', 'description_es', 'description_raw', 'extra_data'].includes(f))];

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Data grid</h1>
          <p className="text-sm text-muted-foreground">
            Internal QA view of every canonical listing.{' '}
            <span className="font-mono">{rows.length}</span> row{rows.length === 1 ? '' : 's'}
            {' · '}
            {error ? <span className="text-destructive">{error.message}</span> : `${visibleFields.length} columns`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <NewListingButton />
          <span className="mx-2 h-4 w-px bg-border" aria-hidden="true" />
          <Link
            href="/admin/data-grid"
            className={`rounded-md border px-2 py-1 text-xs ${!activeGroup ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
          >
            All
          </Link>
          {FIELD_GROUPS.map(g => (
            <Link
              key={g.label}
              href={`/admin/data-grid?group=${encodeURIComponent(g.label)}`}
              className={`rounded-md border px-2 py-1 text-xs ${activeGroup?.label === g.label ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
            >
              {g.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="crdg-card overflow-hidden">
        <div className="overflow-x-auto" style={{ maxHeight: '75vh' }}>
          <table className="w-max min-w-full text-xs">
            <thead className="sticky top-0 z-10 bg-card shadow-sm">
              <tr className="border-b">
                {visibleFields.map(f => (
                  <th
                    key={f}
                    className="whitespace-nowrap border-r px-2 py-2 text-left font-mono text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    {f}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={(r['id'] as string) ?? i} className="border-b hover:bg-muted/40">
                  {visibleFields.map(f => (
                    <td key={f} className="whitespace-nowrap border-r px-2 py-1.5 align-top">
                      <Cell field={f} value={r[f]} slug={r['slug'] as string} id={r['id'] as string} />
                    </td>
                  ))}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={visibleFields.length} className="px-4 py-8 text-center text-muted-foreground">
                    No listings yet. Run a scrape to populate this view.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Cell({ field, value, slug, id }: { field: string; value: unknown; slug: string; id: string }) {
  if (field === '__edit') {
    return (
      <Link
        href={`/admin/listings/${id}/edit`}
        className="inline-flex items-center gap-1 rounded-md border bg-muted px-2 py-1 text-[10px] font-medium hover:bg-accent hover:text-accent-foreground"
        title="Open master edit view"
      >
        <Pencil className="h-3 w-3" /> edit
      </Link>
    );
  }
  if (value === null || value === undefined) return <span className="text-muted-foreground/50">—</span>;

  if (field === 'slug' && typeof value === 'string') {
    return (
      <Link href={`/listings/${value}`} className="font-mono text-primary underline-offset-2 hover:underline">
        {value}
      </Link>
    );
  }
  if (field === 'primary_source_url' && typeof value === 'string') {
    return (
      <a href={value} target="_blank" rel="noreferrer" className="max-w-[280px] truncate text-primary underline-offset-2 hover:underline">
        ↗ {value.replace(/^https?:\/\//, '').slice(0, 50)}
      </a>
    );
  }
  if (field === 'virtual_tour_url' && typeof value === 'string') {
    return <a href={value} target="_blank" rel="noreferrer" className="text-primary">↗ tour</a>;
  }
  if (field.startsWith('price') && typeof value === 'number' && field.includes('usd')) {
    return <span className="font-mono tabular-nums">{formatUsd(value)}</span>;
  }
  if ((field === 'lat' || field === 'lng') && (typeof value === 'number' || typeof value === 'string')) {
    return <span className="font-mono tabular-nums">{Number(value).toFixed(4)}</span>;
  }
  if (typeof value === 'number') {
    return <span className="font-mono tabular-nums">{formatNumber(value)}</span>;
  }
  if (typeof value === 'boolean') {
    return <span className={value ? 'text-emerald-600' : 'text-rose-600'}>{value ? 'yes' : 'no'}</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-muted-foreground/50">[]</span>;
    return (
      <span className="inline-flex max-w-[280px] flex-wrap gap-1 truncate">
        {value.slice(0, 6).map((v, i) => (
          <span key={i} className="rounded border bg-muted px-1.5 py-0.5 text-[10px]">
            {String(v)}
          </span>
        ))}
        {value.length > 6 && <span className="text-[10px] text-muted-foreground">+{value.length - 6}</span>}
      </span>
    );
  }
  if (typeof value === 'object') {
    const json = JSON.stringify(value);
    return (
      <span className="max-w-[260px] truncate font-mono text-[10px]" title={json}>
        {json.slice(0, 40)}
      </span>
    );
  }
  if (typeof value === 'string') {
    if (field.endsWith('_at') && /^\d{4}/.test(value)) {
      return <span className="font-mono text-[10px]">{value.slice(0, 10)}</span>;
    }
    if (value.length > 60) {
      return (
        <span className="max-w-[280px] truncate" title={value}>
          {value.slice(0, 60)}…
        </span>
      );
    }
    return <span>{value}</span>;
  }
  void slug;
  return <span>{String(value)}</span>;
}
