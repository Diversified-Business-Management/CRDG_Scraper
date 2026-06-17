'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { AgentRow } from '@/lib/types';

export function ListingEditPanel({
  slug,
  initialTags,
  initialAgentId,
  agents,
}: {
  slug: string;
  initialTags: string[];
  initialAgentId: string | null;
  agents: AgentRow[];
}) {
  const [tags, setTags] = useState<string[]>(initialTags);
  const [tagInput, setTagInput] = useState('');
  const [agentId, setAgentId] = useState<string | null>(initialAgentId);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  function addTag() {
    const value = tagInput.trim().toLowerCase().replace(/\s+/g, '_');
    if (!value || tags.includes(value)) return;
    setTags([...tags, value]);
    setTagInput('');
  }

  function removeTag(tag: string) {
    setTags(tags.filter((t) => t !== tag));
  }

  async function save() {
    setStatus('saving');
    setError(null);
    try {
      const res = await fetch(`/api/listings/${slug}/update`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tags_human: tags, agent_id: agentId }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? 'Failed to save');
      }
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2000);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }

  return (
    <div className="crdg-card p-4">
      <h3 className="text-sm font-semibold">Realtor edit</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Tweak the human-curated fields. Saved instantly.
      </p>

      <div className="mt-4 space-y-2">
        <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Assigned agent
        </label>
        <select
          value={agentId ?? ''}
          onChange={(e) => setAgentId(e.target.value || null)}
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">— Unassigned —</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.email})
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 space-y-2">
        <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Human tags
        </label>
        <div className="flex flex-wrap gap-1.5">
          {tags.length === 0 && (
            <span className="text-xs text-muted-foreground">No tags yet</span>
          )}
          {tags.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 rounded-full border bg-secondary px-2 py-0.5 text-xs"
            >
              {t}
              <button
                type="button"
                onClick={() => removeTag(t)}
                className="rounded-full hover:bg-background"
                aria-label={`Remove ${t}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Add a tag…"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTag();
              }
            }}
          />
          <Button type="button" size="sm" variant="outline" onClick={addTag}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Button onClick={save} disabled={status === 'saving'} variant="accent" size="sm">
          {status === 'saving' ? 'Saving…' : 'Save changes'}
        </Button>
        {status === 'saved' && <span className="text-xs text-emerald-600">Saved.</span>}
        {status === 'error' && error && (
          <span className="text-xs text-destructive">{error}</span>
        )}
      </div>
    </div>
  );
}
