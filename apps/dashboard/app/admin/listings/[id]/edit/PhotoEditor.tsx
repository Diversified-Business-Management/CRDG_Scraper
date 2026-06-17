'use client';

import Image from 'next/image';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Star, Eye, EyeOff, Trash2, Plus, Loader2, ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export interface PhotoLite {
  id: string;
  url_source: string;
  url_supabase: string | null;
  position: number | null;
  is_hero: boolean;
  is_rejected: boolean;
  reject_reason: string | null;
  alt_text_en: string | null;
  width: number | null;
  height: number | null;
  ai_validation_notes: string | null;
}

export function PhotoEditor({ listingId, photos: initial }: { listingId: string; photos: PhotoLite[] }) {
  const router = useRouter();
  const [photos, setPhotos] = useState<PhotoLite[]>(initial);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [newUrl, setNewUrl] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const refresh = () => router.refresh();

  const patch = async (id: string, body: Partial<PhotoLite>) => {
    setBusy(id);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/photos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const updated = (await res.json()) as PhotoLite;
      setPhotos(prev => prev.map(p => p.id === id ? { ...p, ...updated } : p));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this photo permanently?')) return;
    setBusy(id);
    try {
      const res = await fetch(`/api/admin/photos/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPhotos(prev => prev.filter(p => p.id !== id));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const addByUrl = () => {
    if (!newUrl.trim()) return;
    setErr(null);
    start(async () => {
      try {
        const res = await fetch(`/api/admin/listings/${listingId}/photos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: newUrl.trim() }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? `HTTP ${res.status}`);
        }
        const added = (await res.json()) as PhotoLite;
        setPhotos(prev => [...prev, added]);
        setNewUrl('');
        refresh();
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  };

  const move = async (id: string, dir: -1 | 1) => {
    const idx = photos.findIndex(p => p.id === id);
    const target = idx + dir;
    if (target < 0 || target >= photos.length) return;
    const a = photos[idx]!;
    const b = photos[target]!;
    const newPhotos = [...photos];
    newPhotos[idx] = b;
    newPhotos[target] = a;
    setPhotos(newPhotos);
    await Promise.all([
      fetch(`/api/admin/photos/${a.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ position: target }) }),
      fetch(`/api/admin/photos/${b.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ position: idx }) }),
    ]);
  };

  const active = photos.filter(p => !p.is_rejected).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const rejected = photos.filter(p => p.is_rejected);

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Active photos · <span className="font-mono">{active.length}</span>
          </h3>
        </div>
        {active.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">No active photos.</p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {active.map((p, i) => (
              <PhotoTile
                key={p.id}
                photo={p}
                busy={busy === p.id}
                onMakeHero={() => patch(p.id, { is_hero: true })}
                onReject={() => patch(p.id, { is_rejected: true, reject_reason: 'manual' })}
                onDelete={() => remove(p.id)}
                onMoveUp={i > 0 ? () => move(p.id, -1) : undefined}
                onMoveDown={i < active.length - 1 ? () => move(p.id, 1) : undefined}
                onAltChange={(alt) => patch(p.id, { alt_text_en: alt })}
              />
            ))}
          </div>
        )}
      </div>

      {rejected.length > 0 && (
        <details className="crdg-card p-3" open={false}>
          <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Rejected photos · <span className="font-mono">{rejected.length}</span>
          </summary>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {rejected.map(p => (
              <PhotoTile
                key={p.id}
                photo={p}
                busy={busy === p.id}
                onMakeHero={() => patch(p.id, { is_hero: true, is_rejected: false, reject_reason: null })}
                onReject={() => patch(p.id, { is_rejected: false, reject_reason: null })}
                onDelete={() => remove(p.id)}
                onAltChange={(alt) => patch(p.id, { alt_text_en: alt })}
                showRejectReason
                rejectButtonLabel="Restore"
              />
            ))}
          </div>
        </details>
      )}

      <div className="crdg-card p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Add a photo by URL</h3>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Input
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="https://example.com/photo.jpg"
            className="flex-1 min-w-[280px]"
          />
          <Button onClick={addByUrl} disabled={pending || !newUrl.trim()}>
            {pending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
            Add
          </Button>
        </div>
        {err && <p className="mt-2 text-xs text-destructive">{err}</p>}
      </div>
    </div>
  );
}

function PhotoTile({
  photo, busy, onMakeHero, onReject, onDelete, onMoveUp, onMoveDown, onAltChange,
  showRejectReason, rejectButtonLabel,
}: {
  photo: PhotoLite;
  busy?: boolean;
  onMakeHero?: () => void;
  onReject?: () => void;
  onDelete?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onAltChange?: (alt: string) => void;
  showRejectReason?: boolean;
  rejectButtonLabel?: string;
}) {
  const [alt, setAlt] = useState(photo.alt_text_en ?? '');
  const url = photo.url_supabase ?? photo.url_source;
  return (
    <div className="crdg-card overflow-hidden">
      <div className="relative aspect-[4/3] bg-muted">
        <Image src={url} alt={alt || 'Listing photo'} fill sizes="320px" className={`object-cover ${photo.is_rejected ? 'opacity-40' : ''}`} unoptimized />
        {photo.is_hero && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            <Star className="h-3 w-3" /> Hero
          </span>
        )}
        {photo.is_rejected && (
          <span className="absolute right-2 top-2 rounded-md bg-rose-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            Rejected
          </span>
        )}
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
      </div>
      <div className="space-y-2 p-2 text-xs">
        {showRejectReason && photo.reject_reason && (
          <p className="line-clamp-2 text-muted-foreground" title={photo.reject_reason}>
            {photo.reject_reason}
          </p>
        )}
        <Input
          value={alt}
          onChange={(e) => setAlt(e.target.value)}
          onBlur={() => alt !== (photo.alt_text_en ?? '') && onAltChange?.(alt)}
          placeholder="Alt text"
          className="text-xs"
        />
        <div className="flex flex-wrap items-center gap-1">
          {!photo.is_rejected && (
            <button
              type="button"
              onClick={onMakeHero}
              disabled={busy || photo.is_hero}
              className="inline-flex items-center gap-1 rounded-md border bg-muted px-1.5 py-0.5 text-[10px] hover:bg-accent disabled:opacity-50"
            >
              <Star className="h-3 w-3" /> Hero
            </button>
          )}
          <button
            type="button"
            onClick={onReject}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-md border bg-muted px-1.5 py-0.5 text-[10px] hover:bg-accent disabled:opacity-50"
            title={photo.is_rejected ? 'Restore to active' : 'Reject from gallery'}
          >
            {photo.is_rejected ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            {rejectButtonLabel ?? 'Hide'}
          </button>
          {onMoveUp && (
            <button type="button" onClick={onMoveUp} disabled={busy} className="rounded-md border bg-muted px-1 py-0.5 hover:bg-accent disabled:opacity-50" title="Move up">
              <ArrowUp className="h-3 w-3" />
            </button>
          )}
          {onMoveDown && (
            <button type="button" onClick={onMoveDown} disabled={busy} className="rounded-md border bg-muted px-1 py-0.5 hover:bg-accent disabled:opacity-50" title="Move down">
              <ArrowDown className="h-3 w-3" />
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className="ml-auto inline-flex items-center gap-1 rounded-md border bg-muted px-1.5 py-0.5 text-[10px] text-destructive hover:bg-destructive/10 disabled:opacity-50"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
