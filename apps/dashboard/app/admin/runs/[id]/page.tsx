import { format } from 'date-fns';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createServerSupabase } from '@/lib/supabase/server';
import { cn, formatUsd, statusColor } from '@/lib/utils';
import type { RecentRunRow, RunLogRow } from '@/lib/types';

const STAGES = ['enumerate', 'fetch', 'extract', 'normalize', 'dedupe', 'enrich', 'publish', 'sync'];

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabase();

  const [{ data: runData }, { data: logsData }] = await Promise.all([
    supabase.from('v_recent_runs').select('*').eq('id', id).maybeSingle(),
    supabase
      .from('run_logs')
      .select('*')
      .eq('run_id', id)
      .order('created_at', { ascending: true }),
  ]);

  const run = runData as RecentRunRow | null;
  const logs = (logsData ?? []) as RunLogRow[];

  if (!run) {
    return (
      <div className="space-y-4">
        <Link href="/admin/runs" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <div className="crdg-card p-6 text-sm">Run not found.</div>
      </div>
    );
  }

  const grouped = new Map<string, RunLogRow[]>();
  for (const stage of STAGES) grouped.set(stage, []);
  for (const log of logs) {
    if (!grouped.has(log.stage)) grouped.set(log.stage, []);
    grouped.get(log.stage)!.push(log);
  }

  return (
    <div className="space-y-6">
      <Link href="/admin/runs" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to runs
      </Link>

      <div className="crdg-card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{run.source_name}</h1>
            <p className="text-xs text-muted-foreground">
              Run {run.id.slice(0, 8)} · {run.trigger} · started {format(new Date(run.started_at), 'PPpp')}
            </p>
          </div>
          <span
            className={cn(
              'rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
              statusColor(run.status)
            )}
          >
            {run.status}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
          <Stat label="Seen" value={run.listings_seen ?? 0} />
          <Stat label="New" value={run.listings_new ?? 0} />
          <Stat label="Updated" value={run.listings_updated ?? 0} />
          <Stat label="Failed" value={run.listings_failed ?? 0} />
          <Stat label="Cost" value={formatUsd(Number(run.cost_usd ?? 0))} />
        </div>
        {run.error && (
          <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {run.error}
          </div>
        )}
      </div>

      <div className="space-y-3">
        {STAGES.map((stage) => {
          const stageLogs = grouped.get(stage) ?? [];
          if (stageLogs.length === 0) return null;
          const errorCount = stageLogs.filter((l) => l.level === 'error').length;
          const warnCount = stageLogs.filter((l) => l.level === 'warn').length;
          return (
            <details
              key={stage}
              className="crdg-card overflow-hidden"
              open={errorCount > 0}
            >
              <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 hover:bg-secondary/30">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm font-medium uppercase tracking-wide">{stage}</span>
                  <span className="text-xs text-muted-foreground">{stageLogs.length} events</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {errorCount > 0 && (
                    <span className="rounded-md bg-rose-100 px-2 py-0.5 text-rose-800 dark:bg-rose-900/30 dark:text-rose-200">
                      {errorCount} err
                    </span>
                  )}
                  {warnCount > 0 && (
                    <span className="rounded-md bg-amber-100 px-2 py-0.5 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                      {warnCount} warn
                    </span>
                  )}
                </div>
              </summary>
              <div className="max-h-96 overflow-y-auto border-t bg-secondary/10">
                <table className="w-full text-xs">
                  <tbody>
                    {stageLogs.map((l) => (
                      <tr key={l.id} className="border-b last:border-b-0">
                        <td className="w-32 px-3 py-1 font-mono text-muted-foreground">
                          {format(new Date(l.created_at), 'HH:mm:ss.SSS')}
                        </td>
                        <td className="w-16 px-2 py-1 font-mono uppercase">
                          <span
                            className={cn(
                              'rounded px-1.5 py-0.5',
                              l.level === 'error' && 'bg-rose-100 text-rose-800',
                              l.level === 'warn' && 'bg-amber-100 text-amber-800',
                              l.level === 'info' && 'text-muted-foreground'
                            )}
                          >
                            {l.level}
                          </span>
                        </td>
                        <td className="px-2 py-1">{l.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          );
        })}
        {logs.length === 0 && (
          <div className="crdg-card p-6 text-sm text-muted-foreground">No logs recorded.</div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
