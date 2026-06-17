'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatUsd } from '@/lib/utils';

interface CanonicalLite {
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
}

interface RawLite {
  id: string;
  source_url: string;
  source_id: string;
  normalized: Record<string, unknown> | null;
}

export function DedupRow({
  linkId,
  confidence,
  method,
  reason,
  createdAt,
  canonical,
  raw,
}: {
  linkId: string;
  confidence: number;
  method: string;
  reason: string | null;
  createdAt: string;
  canonical: CanonicalLite | null;
  raw: RawLite | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function decide(decision: 'accept' | 'reject') {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/dedup/${linkId}/decide`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      if (res.ok) {
        setDone(true);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  if (done) return null;

  const rawNorm = (raw?.normalized ?? {}) as Record<string, unknown>;
  const rawTitle = (rawNorm.title as string | undefined) ?? '(unknown title)';
  const rawPrice = rawNorm.price_usd ?? rawNorm.price;
  const rawLocality = rawNorm.locality;

  return (
    <div className="crdg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge variant="outline">conf {confidence.toFixed(2)}</Badge>
          <Badge variant="secondary">{method}</Badge>
          <span className="text-xs text-muted-foreground">{createdAt}</span>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => decide('reject')}
            disabled={busy}
          >
            <X className="h-3.5 w-3.5" />
            Reject
          </Button>
          <Button variant="accent" size="sm" onClick={() => decide('accept')} disabled={busy}>
            <Check className="h-3.5 w-3.5" />
            Accept
          </Button>
        </div>
      </div>
      {reason && (
        <p className="mt-2 rounded-md bg-secondary/40 p-2 text-xs text-muted-foreground">
          {reason}
        </p>
      )}
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-md border bg-background p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Canonical
          </div>
          {canonical ? (
            <div className="mt-2 space-y-1 text-sm">
              <div className="font-medium">
                {canonical.title_en ?? canonical.title_es ?? canonical.slug}
              </div>
              <div className="font-mono text-sm">{formatUsd(canonical.price_usd)}</div>
              <div className="text-xs text-muted-foreground">
                {canonical.locality ?? '—'} · {canonical.region_slug ?? '—'}
              </div>
              <div className="text-xs text-muted-foreground">
                {canonical.bedrooms ?? '—'}bd · {canonical.bathrooms ?? '—'}ba ·{' '}
                {canonical.interior_sqm ?? '—'}m²
              </div>
            </div>
          ) : (
            <div className="mt-2 text-xs text-muted-foreground">missing</div>
          )}
        </div>
        <div className="rounded-md border bg-background p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Raw candidate
          </div>
          {raw ? (
            <div className="mt-2 space-y-1 text-sm">
              <div className="font-medium">{rawTitle}</div>
              <div className="font-mono text-sm">
                {typeof rawPrice === 'number' ? formatUsd(rawPrice) : '—'}
              </div>
              <div className="text-xs text-muted-foreground">
                {typeof rawLocality === 'string' ? rawLocality : '—'}
              </div>
              <a
                href={raw.source_url}
                target="_blank"
                rel="noreferrer"
                className="text-xs underline"
              >
                source ↗
              </a>
            </div>
          ) : (
            <div className="mt-2 text-xs text-muted-foreground">missing</div>
          )}
        </div>
      </div>
    </div>
  );
}
