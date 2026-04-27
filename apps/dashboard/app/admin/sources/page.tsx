import { format } from 'date-fns';
import { createServerSupabase } from '@/lib/supabase/server';
import { SourceRowActions } from './SourceRowActions';
import { Badge } from '@/components/ui/Badge';

interface JoinedSource {
  id: string;
  slug: string;
  name: string;
  enabled: boolean;
  notes: string | null;
  source_configs: {
    id: string;
    cron_expression: string;
    rate_limit_rps: number;
    burst: number;
    max_listings_per_run: number;
    regions: string[] | null;
    enabled: boolean;
    last_run_at: string | null;
  } | null;
}

export default async function SourcesPage() {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('sources')
    .select('id, slug, name, enabled, notes, source_configs(id, cron_expression, rate_limit_rps, burst, max_listings_per_run, regions, enabled, last_run_at)')
    .order('slug');

  const rows = ((data ?? []) as unknown as JoinedSource[]).map((s) => ({
    ...s,
    source_configs: Array.isArray(s.source_configs) ? s.source_configs[0] ?? null : s.source_configs,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sources</h1>
        <p className="text-sm text-muted-foreground">
          Adapters that feed raw listings into the pipeline.
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
              <th className="px-4 py-3">Enabled</th>
              <th className="px-4 py-3">Cron</th>
              <th className="px-4 py-3">Rate (rps)</th>
              <th className="px-4 py-3">Max / run</th>
              <th className="px-4 py-3">Regions</th>
              <th className="px-4 py-3">Last run</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-muted-foreground" colSpan={8}>
                  No sources yet.
                </td>
              </tr>
            )}
            {rows.map((s) => {
              const cfg = s.source_configs;
              return (
                <tr key={s.id} className="border-t">
                  <td className="px-4 py-3">
                    <div className="font-medium">{s.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">{s.slug}</div>
                  </td>
                  <td className="px-4 py-3">
                    {(cfg?.enabled ?? s.enabled) ? (
                      <Badge>on</Badge>
                    ) : (
                      <Badge variant="secondary">off</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{cfg?.cron_expression ?? '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs">{cfg?.rate_limit_rps ?? '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs">{cfg?.max_listings_per_run ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {cfg?.regions?.length ? cfg.regions.join(', ') : 'all'}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {cfg?.last_run_at ? format(new Date(cfg.last_run_at), 'Pp') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <SourceRowActions
                      sourceId={s.id}
                      sourceSlug={s.slug}
                      enabled={cfg?.enabled ?? s.enabled}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
