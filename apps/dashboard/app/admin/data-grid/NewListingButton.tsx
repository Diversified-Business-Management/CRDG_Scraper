'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export function NewListingButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const create = () => {
    setErr(null);
    start(async () => {
      const res = await fetch('/api/admin/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'draft', property_type: 'house' }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErr(json.error ?? `HTTP ${res.status}`);
        return;
      }
      router.push(`/admin/listings/${json.id}/edit`);
    });
  };

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" onClick={create} disabled={pending}>
        {pending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Plus className="mr-1 h-3 w-3" />}
        New listing
      </Button>
      {err && <span className="text-xs text-destructive">{err}</span>}
    </div>
  );
}
