'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface FieldSpec {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'array' | 'boolean' | 'enum';
  options?: string[];
}

const SECTIONS: Array<{ title: string; fields: FieldSpec[] }> = [
  {
    title: 'Identity',
    fields: [
      { key: 'status', label: 'Status', type: 'enum', options: ['draft', 'active', 'pending_review', 'sold', 'withdrawn', 'stale'] },
      { key: 'property_type', label: 'Property type', type: 'enum', options: ['house', 'condo', 'lot', 'farm', 'commercial', 'hotel', 'other'] },
      { key: 'property_subtype', label: 'Property subtype', type: 'text' },
      { key: 'mls_id', label: 'MLS ID', type: 'text' },
      { key: 'mls_status', label: 'MLS status', type: 'text' },
    ],
  },
  {
    title: 'Title & description',
    fields: [
      { key: 'title_en', label: 'Title (EN)', type: 'text' },
      { key: 'title_es', label: 'Title (ES)', type: 'text' },
      { key: 'description_en', label: 'Description (EN)', type: 'textarea' },
      { key: 'description_es', label: 'Description (ES)', type: 'textarea' },
      { key: 'notes', label: 'Internal notes', type: 'textarea' },
    ],
  },
  {
    title: 'Pricing',
    fields: [
      { key: 'price', label: 'Price (raw)', type: 'number' },
      { key: 'price_currency', label: 'Currency', type: 'enum', options: ['USD', 'CRC'] },
      { key: 'price_usd', label: 'Price USD', type: 'number' },
      { key: 'list_price_original_usd', label: 'Original list (USD)', type: 'number' },
      { key: 'sold_price_usd', label: 'Sold price (USD)', type: 'number' },
      { key: 'hoa_fee_usd', label: 'HOA / mo (USD)', type: 'number' },
      { key: 'hoa_fee_frequency', label: 'HOA frequency', type: 'enum', options: ['monthly', 'quarterly', 'annually'] },
      { key: 'taxes_usd_annual', label: 'Taxes / yr (USD)', type: 'number' },
      { key: 'tax_year', label: 'Tax year', type: 'number' },
    ],
  },
  {
    title: 'Dimensions',
    fields: [
      { key: 'bedrooms', label: 'Bedrooms', type: 'number' },
      { key: 'bathrooms', label: 'Bathrooms (total)', type: 'number' },
      { key: 'bathrooms_full', label: 'Bathrooms — full', type: 'number' },
      { key: 'bathrooms_half', label: 'Bathrooms — half', type: 'number' },
      { key: 'interior_sqm', label: 'Interior (m²)', type: 'number' },
      { key: 'total_structure_area_sqm', label: 'Total structure (m²)', type: 'number' },
      { key: 'lot_sqm', label: 'Lot (m²)', type: 'number' },
      { key: 'year_built', label: 'Year built', type: 'number' },
      { key: 'year_renovated', label: 'Year renovated', type: 'number' },
      { key: 'stories_total', label: 'Stories', type: 'number' },
      { key: 'floor_number', label: 'Floor #', type: 'number' },
      { key: 'parking_spaces', label: 'Parking spaces', type: 'number' },
      { key: 'garage_spaces', label: 'Garage spaces', type: 'number' },
      { key: 'fireplaces_count', label: 'Fireplaces', type: 'number' },
    ],
  },
  {
    title: 'Location',
    fields: [
      { key: 'region_slug', label: 'Region', type: 'enum', options: ['central-pacific', 'guanacaste', 'central-valley', 'nicoya', 'caribbean', 'south-pacific'] },
      { key: 'province', label: 'Province', type: 'text' },
      { key: 'canton', label: 'Canton', type: 'text' },
      { key: 'district', label: 'District', type: 'text' },
      { key: 'locality', label: 'Locality', type: 'text' },
      { key: 'address_line', label: 'Address', type: 'text' },
      { key: 'postal_code', label: 'Postal code', type: 'text' },
      { key: 'community_name', label: 'Community', type: 'text' },
      { key: 'building_name', label: 'Building', type: 'text' },
      { key: 'gated_community', label: 'Gated community', type: 'boolean' },
      { key: 'lat', label: 'Latitude', type: 'number' },
      { key: 'lng', label: 'Longitude', type: 'number' },
    ],
  },
  {
    title: 'Distances',
    fields: [
      { key: 'distance_to_beach_km', label: 'Beach (km)', type: 'number' },
      { key: 'distance_to_airport_km', label: 'Airport (km)', type: 'number' },
      { key: 'nearest_airport_code', label: 'Airport code', type: 'text' },
      { key: 'distance_to_school_km', label: 'School (km)', type: 'number' },
      { key: 'distance_to_hospital_km', label: 'Hospital (km)', type: 'number' },
    ],
  },
  {
    title: 'Utilities & connectivity',
    fields: [
      { key: 'pool_yn', label: 'Pool', type: 'boolean' },
      { key: 'jacuzzi_yn', label: 'Jacuzzi', type: 'boolean' },
      { key: 'parking_yn', label: 'Parking', type: 'boolean' },
      { key: 'telephone_yn', label: 'Telephone', type: 'boolean' },
      { key: 'internet_quality', label: 'Internet quality', type: 'text' },
      { key: 'internet_types', label: 'Internet types', type: 'array' },
      { key: 'television_types', label: 'Television types', type: 'array' },
      { key: 'ac_types', label: 'A/C types', type: 'array' },
      { key: 'water_source', label: 'Water source', type: 'text' },
      { key: 'electricity', label: 'Electricity', type: 'text' },
      { key: 'furnishings_included', label: 'Furnished', type: 'enum', options: ['fully', 'partially', 'unfurnished', 'negotiable'] },
    ],
  },
  {
    title: 'Costa Rica legal',
    fields: [
      { key: 'title_status', label: 'Title status', type: 'enum', options: ['titled', 'concession', 'unclear'] },
      { key: 'maritime_zone', label: 'Maritime zone', type: 'boolean' },
      { key: 'foreigner_buyable', label: 'Foreigner buyable', type: 'boolean' },
      { key: 'road_access', label: 'Road access', type: 'enum', options: ['paved', 'gravel', 'dirt', '4x4_only', 'private'] },
      { key: 'zoning', label: 'Zoning', type: 'text' },
    ],
  },
  {
    title: 'Construction',
    fields: [
      { key: 'condition', label: 'Condition', type: 'text' },
      { key: 'construction_status', label: 'Construction status', type: 'text' },
      { key: 'architectural_style', label: 'Architectural style', type: 'text' },
      { key: 'new_construction_yn', label: 'New construction', type: 'boolean' },
      { key: 'foundation', label: 'Foundation', type: 'array' },
      { key: 'roof', label: 'Roof', type: 'array' },
      { key: 'flooring', label: 'Flooring', type: 'array' },
    ],
  },
  {
    title: 'Features (chips, comma-separated)',
    fields: [
      { key: 'features', label: 'Features', type: 'array' },
      { key: 'view_types', label: 'View types', type: 'array' },
      { key: 'pool_features', label: 'Pool features', type: 'array' },
      { key: 'parking_features', label: 'Parking features', type: 'array' },
      { key: 'interior_features', label: 'Interior features', type: 'array' },
      { key: 'exterior_features', label: 'Exterior features', type: 'array' },
      { key: 'kitchen_features', label: 'Kitchen features', type: 'array' },
      { key: 'bedroom_features', label: 'Bedroom features', type: 'array' },
      { key: 'dining_room_features', label: 'Dining features', type: 'array' },
      { key: 'family_room_features', label: 'Family room features', type: 'array' },
      { key: 'laundry_features', label: 'Laundry features', type: 'array' },
      { key: 'fireplace_features', label: 'Fireplace features', type: 'array' },
      { key: 'appliances', label: 'Appliances', type: 'array' },
      { key: 'cooling', label: 'Cooling', type: 'array' },
      { key: 'heating', label: 'Heating', type: 'array' },
      { key: 'tags_human', label: 'Tags (human)', type: 'array' },
      { key: 'tags_ai', label: 'Tags (AI)', type: 'array' },
    ],
  },
  {
    title: 'Houzez template extras',
    fields: [
      { key: 'tour_360_url', label: '360° tour URL', type: 'text' },
      { key: 'video_thumbnail_url', label: 'Video poster URL', type: 'text' },
      { key: 'energy_class', label: 'Energy class (A–G)', type: 'enum', options: ['A', 'B', 'C', 'D', 'E', 'F', 'G'] },
      { key: 'energy_index', label: 'Energy index (kWh/m²/yr)', type: 'number' },
      { key: 'property_labels', label: 'Property labels', type: 'array' },
      { key: 'show_map', label: 'Show map', type: 'boolean' },
      { key: 'show_street_view', label: 'Show street view', type: 'boolean' },
    ],
  },
  {
    title: 'Agent / source',
    fields: [
      { key: 'listing_agent_name', label: 'Listing agent name', type: 'text' },
      { key: 'listing_agent_phone', label: 'Phone', type: 'text' },
      { key: 'listing_agent_email', label: 'Email', type: 'text' },
      { key: 'source_brokerage', label: 'Brokerage', type: 'text' },
      { key: 'source_brokerage_phone', label: 'Brokerage phone', type: 'text' },
      { key: 'primary_source_url', label: 'Original URL', type: 'text' },
      { key: 'virtual_tour_url', label: 'Virtual tour URL', type: 'text' },
      { key: 'video_url', label: 'Video URL', type: 'text' },
      { key: 'floorplan_url', label: 'Floor plan URL', type: 'text' },
    ],
  },
];

function valToInput(spec: FieldSpec, v: unknown): string {
  if (v === null || v === undefined) return '';
  if (spec.type === 'boolean') return v ? 'true' : 'false';
  if (spec.type === 'array' && Array.isArray(v)) return v.join(', ');
  if (typeof v === 'number') return String(v);
  return String(v);
}

function inputToVal(spec: FieldSpec, raw: string): unknown {
  if (raw === '') return null;
  if (spec.type === 'number') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  if (spec.type === 'boolean') {
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return null;
  }
  if (spec.type === 'array') {
    return raw.split(',').map(s => s.trim()).filter(Boolean);
  }
  return raw;
}

export function EditForm({ listing }: { listing: Record<string, unknown> }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const sec of SECTIONS) for (const f of sec.fields) init[f.key] = valToInput(f, listing[f.key]);
    return init;
  });
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ kind: 'idle' | 'saved' | 'error'; msg?: string }>({ kind: 'idle' });

  const setField = (k: string, v: string) => setValues(prev => ({ ...prev, [k]: v }));

  const dirtyKeys = (): string[] => {
    const out: string[] = [];
    for (const sec of SECTIONS) for (const f of sec.fields) {
      if (values[f.key] !== valToInput(f, listing[f.key])) out.push(f.key);
    }
    return out;
  };

  const save = () => {
    const dirty = dirtyKeys();
    if (dirty.length === 0) { setStatus({ kind: 'idle', msg: 'no changes' }); return; }
    const patch: Record<string, unknown> = {};
    for (const sec of SECTIONS) for (const f of sec.fields) {
      if (!dirty.includes(f.key)) continue;
      patch[f.key] = inputToVal(f, values[f.key] ?? '');
    }
    startTransition(async () => {
      const res = await fetch(`/api/admin/listings/${listing['id']}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setStatus({ kind: 'error', msg: err.error ?? `HTTP ${res.status}` });
        return;
      }
      setStatus({ kind: 'saved', msg: `${dirty.length} field${dirty.length === 1 ? '' : 's'} saved` });
      router.refresh();
    });
  };

  const remove = () => {
    if (!confirm(`Delete this listing permanently? This will cascade to photos, dedup links, embeddings, and sync log.`)) return;
    startTransition(async () => {
      const res = await fetch(`/api/admin/listings/${listing['id']}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setStatus({ kind: 'error', msg: err.error ?? `Delete HTTP ${res.status}` });
        return;
      }
      router.push('/admin/data-grid');
    });
  };

  const dirtyCount = dirtyKeys().length;

  return (
    <div className="space-y-4">
      {/* Sticky save bar */}
      <div className="sticky top-0 z-20 -mx-2 flex items-center justify-between gap-3 border-b bg-background/95 px-2 py-3 backdrop-blur">
        <div className="text-sm text-muted-foreground">
          {dirtyCount > 0 ? <span className="font-medium text-amber-600">{dirtyCount} unsaved change{dirtyCount === 1 ? '' : 's'}</span> : 'No changes'}
          {status.msg && <span className={`ml-3 text-xs ${status.kind === 'error' ? 'text-destructive' : 'text-emerald-600'}`}>{status.msg}</span>}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={remove} disabled={pending} className="text-destructive">
            <Trash2 className="mr-1 h-4 w-4" /> Delete
          </Button>
          <Button onClick={save} disabled={pending || dirtyCount === 0}>
            {pending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
            Save
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {SECTIONS.map(sec => (
          <details key={sec.title} className="crdg-card p-4" open>
            <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {sec.title}
            </summary>
            <div className="mt-3 grid gap-3">
              {sec.fields.map(f => (
                <FieldRow key={f.key} spec={f} value={values[f.key] ?? ''} onChange={(v) => setField(f.key, v)} />
              ))}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

function FieldRow({ spec, value, onChange }: { spec: FieldSpec; value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-[150px_1fr] items-start gap-3">
      <label className="pt-2 text-xs text-muted-foreground" htmlFor={spec.key}>{spec.label}</label>
      {spec.type === 'textarea' ? (
        <textarea
          id={spec.key}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      ) : spec.type === 'enum' ? (
        <select
          id={spec.key}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
        >
          <option value="">—</option>
          {spec.options?.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : spec.type === 'boolean' ? (
        <select
          id={spec.key}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
        >
          <option value="">unknown</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      ) : (
        <Input
          id={spec.key}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={spec.type === 'array' ? 'comma-separated' : ''}
          inputMode={spec.type === 'number' ? 'decimal' : 'text'}
        />
      )}
    </div>
  );
}
