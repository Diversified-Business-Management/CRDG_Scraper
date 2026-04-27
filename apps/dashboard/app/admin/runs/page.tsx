import Link from 'next/link';
import { format } from 'date-fns';
import { createServerSupabase } from '@/lib/supabase/server';
import { Badge } from '@/components/ui/Badge';
import { cn, formatUsd, statusColor } from '@/lib/utils';
import type { RecentRunRow } from '@/lib/types';

export default async function RunsPage() {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('v_recent_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(100);

  const rows = (data ?? []) as RecentRunRow[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Recent runs</h1>
        <p className="text-sm text-muted-foreground">
          Click a row for the per-stage trace.
        </p>
      </div>

      {error && (
        <div className="crdg-card border-destructive/40 p-4 text-sm text-destructive">
          {error.message}
        </div>
      )}

      <div className="crdg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Started</th>
              <th className="px-4 py-3">Duration</th>
              <th className="px-4 py-3 text-right">Seen</th>
              <th className="px-4 py-3 text-right">New</th>
              <th className="px-4 py-3 text-right">Updated</th>
              <th className="px-4 py-3 text-right">Failed</th>
              <th className="px-4 py-3 text-right">Cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-muted-foreground" colSpan={9}>
                  No runs yet.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t hover:bg-secondary/20">
                <td className="px-4 py-3">
                  <Link href={`/admin/runs/${r.id}`} className="block">
                    <div className="font-medium">{r.source_name}</div>
                    <div className="font-mono text-xs text-muted-foreground">{r.trigger}</div>
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      'rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                      statusColor(r.status)
                    )}
                  >
                    {r.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {format(new Date(r.started_at), 'PPpp')}
                </td>
                <td className="px-4 py-3 font-mono text-xs">
                  {r.duration_seconds != null ? `${r.duration_seconds}s` : '—'}
                </td>
                <td className="px-4 py-3 text-right font-mono">{r.listings_seen ?? 0}</td>
                <td className="px-4 py-3 text-right font-mono text-emerald-700 dark:text-emerald-400">
                  {r.listings_new ?? 0}
                </td>
                <td className="px-4 py-3 text-right font-mono">{r.listings_updated ?? 0}</td>
                <td className="px-4 py-3 text-right font-mono text-rose-600">{r.listings_failed ?? 0}</td>
                <td className="px-4 py-3 text-right font-mono">
                  {formatUsd(Number(r.cost_usd ?? 0))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
