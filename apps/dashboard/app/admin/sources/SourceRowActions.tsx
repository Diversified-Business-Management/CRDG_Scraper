'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export function SourceRowActions({
  sourceId,
  sourceSlug,
  enabled,
}: {
  sourceId: string;
  sourceSlug: string;
  enabled: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/sources/${sourceId}/toggle`, { method: 'POST' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? 'Toggle failed');
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  async function runNow() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/runs/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source_id: sourceId, source_slug: sourceSlug }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? 'Run failed to start');
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <Button size="sm" variant="outline" onClick={toggle} disabled={busy}>
        {enabled ? 'Disable' : 'Enable'}
      </Button>
      <Button size="sm" variant="accent" onClick={runNow} disabled={busy}>
        <Play className="h-3.5 w-3.5" />
        Run now
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
