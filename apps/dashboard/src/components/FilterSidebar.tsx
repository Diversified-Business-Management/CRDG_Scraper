'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState, useTransition } from 'react';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FeatureVocab } from '@/lib/types';

const REGIONS: Array<{ slug: string; label: string }> = [
  { slug: 'central-pacific', label: 'Central Pacific' },
  { slug: 'guanacaste', label: 'Guanacaste' },
  { slug: 'central-valley', label: 'Central Valley' },
  { slug: 'nicoya', label: 'Nicoya' },
  { slug: 'caribbean', label: 'Caribbean' },
  { slug: 'south-pacific', label: 'South Pacific' },
];

const PROPERTY_TYPES = ['house', 'condo', 'lot', 'farm', 'commercial', 'hotel', 'other'];

export function FilterSidebar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [q, setQ] = useState(searchParams.get('q') ?? '');

  const updateParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === '') next.delete(k);
        else next.set(k, v);
      }
      // Always reset page when changing filters
      next.delete('page');
      startTransition(() => {
        router.push(`/listings?${next.toString()}`);
      });
    },
    [router, searchParams]
  );

  const toggleMulti = useCallback(
    (key: string, value: string) => {
      const current = (searchParams.get(key) ?? '').split(',').filter(Boolean);
      const has = current.includes(value);
      const next = has ? current.filter((v) => v !== value) : [...current, value];
      updateParams({ [key]: next.length ? next.join(',') : null });
    },
    [searchParams, updateParams]
  );

  const isActive = useCallback(
    (key: string, value: string): boolean => {
      const current = (searchParams.get(key) ?? '').split(',').filter(Boolean);
      return current.includes(value);
    },
    [searchParams]
  );

  const activeCount = useMemo(() => {
    let n = 0;
    for (const k of ['q', 'region', 'type', 'min_price', 'max_price', 'beds', 'baths', 'features']) {
      if (searchParams.get(k)) n++;
    }
    return n;
  }, [searchParams]);

  return (
    <aside className="space-y-6 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-2">
      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Filters</h2>
          {activeCount > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => router.push('/listings')}
              className="h-7 px-2 text-xs"
            >
              <X className="mr-1 h-3 w-3" />
              Clear
            </Button>
          )}
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          updateParams({ q: q || null });
        }}
        className="relative"
      >
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search listings…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-8"
        />
      </form>

      <FilterSection label="Region">
        <div className="space-y-1">
          {REGIONS.map((r) => (
            <Checkbox
              key={r.slug}
              label={r.label}
              checked={isActive('region', r.slug)}
              onChange={() => toggleMulti('region', r.slug)}
            />
          ))}
        </div>
      </FilterSection>

      <FilterSection label="Property type">
        <div className="space-y-1">
          {PROPERTY_TYPES.map((t) => (
            <Checkbox
              key={t}
              label={t.charAt(0).toUpperCase() + t.slice(1)}
              checked={isActive('type', t)}
              onChange={() => toggleMulti('type', t)}
            />
          ))}
        </div>
      </FilterSection>

      <FilterSection label="Price (USD)">
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="number"
            placeholder="Min"
            defaultValue={searchParams.get('min_price') ?? ''}
            onBlur={(e) => updateParams({ min_price: e.target.value || null })}
          />
          <Input
            type="number"
            placeholder="Max"
            defaultValue={searchParams.get('max_price') ?? ''}
            onBlur={(e) => updateParams({ max_price: e.target.value || null })}
          />
        </div>
      </FilterSection>

      <FilterSection label="Beds (min)">
        <div className="flex flex-wrap gap-1">
          {[1, 2, 3, 4, 5].map((n) => {
            const active = searchParams.get('beds') === String(n);
            return (
              <button
                key={n}
                type="button"
                onClick={() => updateParams({ beds: active ? null : String(n) })}
                className={`h-7 w-9 rounded-md border text-xs font-medium transition-colors ${
                  active
                    ? 'border-accent bg-accent text-accent-foreground'
                    : 'bg-background hover:bg-secondary'
                }`}
              >
                {n}+
              </button>
            );
          })}
        </div>
      </FilterSection>

      <FilterSection label="Baths (min)">
        <div className="flex flex-wrap gap-1">
          {[1, 2, 3, 4].map((n) => {
            const active = searchParams.get('baths') === String(n);
            return (
              <button
                key={n}
                type="button"
                onClick={() => updateParams({ baths: active ? null : String(n) })}
                className={`h-7 w-9 rounded-md border text-xs font-medium transition-colors ${
                  active
                    ? 'border-accent bg-accent text-accent-foreground'
                    : 'bg-background hover:bg-secondary'
                }`}
              >
                {n}+
              </button>
            );
          })}
        </div>
      </FilterSection>

      <FilterSection label="Features">
        <div className="flex flex-wrap gap-1">
          {FeatureVocab.slice(0, 14).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => toggleMulti('features', f)}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                isActive('features', f)
                  ? 'border-accent bg-accent text-accent-foreground'
                  : 'bg-background text-muted-foreground hover:bg-secondary'
              }`}
            >
              {f.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </FilterSection>
    </aside>
  );
}

function FilterSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </h3>
      {children}
    </div>
  );
}

function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-secondary">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-3.5 w-3.5 rounded border-input accent-amber-500"
      />
      <span>{label}</span>
    </label>
  );
}
