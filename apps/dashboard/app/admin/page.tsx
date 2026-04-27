import { format, startOfWeek } from 'date-fns';
import { createServerSupabase } from '@/lib/supabase/server';
import { KpiTile } from '@/components/KpiTile';
import { formatUsd } from '@/lib/utils';
import type { AiCostDailyRow, RecentRunRow } from '@/lib/types';
import { Badge } from '@/components/ui/Badge';

export default async function AdminHome() {
  const supabase = await createServerSupabase();

  const [activeListings, totalListings, recentRuns, aiCosts, dedupPending, unsynced] =
    await Promise.all([
      supabase
        .from('canonical_listings')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active'),
      supabase.from('canonical_listings').select('id', { count: 'exact', head: true }),
      supabase.from('v_recent_runs').select('*').limit(50),
      supabase
        .from('ai_costs_daily')
        .select('*')
        .gte('day', format(startOfWeek(new Date()), 'yyyy-MM-dd'))
        .order('day', { ascending: false }),
      supabase
        .from('dedup_links')
        .select('id', { count: 'exact', head: true })
        .is('reviewed_at', null)
        .gte('confidence', 0.6)
        .lte('confidence', 0.85),
      supabase
        .from('canonical_listings')
        .select('id', { count: 'exact', head: true })
        .is('wp_synced_at', null),
    ]);

  const today = format(new Date(), 'yyyy-MM-dd');
  const aiToday = (aiCosts.data ?? []).find((r) => r.day === today)?.cost_usd ?? 0;
  const aiWeek = (aiCosts.data ?? []).reduce(
    (sum: number, r: AiCostDailyRow) => sum + Number(r.cost_usd ?? 0),
    0
  );

  // Last successful run per source
  const runsBySource = new Map<string, RecentRunRow>();
  for (const r of (recentRuns.data ?? []) as RecentRunRow[]) {
    if (!runsBySource.has(r.source_slug) && r.status === 'succeeded') {
      runsBySource.set(r.source_slug, r);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin overview</h1>
        <p className="text-sm text-muted-foreground">Pipeline health at a glance.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          label="Active listings"
          value={(activeListings.count ?? 0).toLocaleString()}
          hint={`${(totalListings.count ?? 0).toLocaleString()} total`}
          href="/listings"
        />
        <KpiTile
          label="AI cost — today"
          value={formatUsd(Number(aiToday))}
          hint={`${formatUsd(Number(aiWeek))} this week`}
          href="/admin/health"
          tone="accent"
        />
        <KpiTile
          label="Pending dedup reviews"
          value={(dedupPending.count ?? 0).toLocaleString()}
          hint="Confidence 0.60–0.85"
          href="/admin/dedup"
          tone={(dedupPending.count ?? 0) > 0 ? 'warning' : 'default'}
        />
        <KpiTile
          label="Unsynced canonical"
          value={(unsynced.count ?? 0).toLocaleString()}
          hint="Awaiting WP publish"
          href="/admin/runs"
        />
      </div>

      <div className="crdg-card p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Last successful run per source
          </h2>
        </div>
        <div className="mt-3 grid gap-2">
          {runsBySource.size === 0 ? (
            <p className="text-sm text-muted-foreground">
              No successful runs yet. Trigger one from the Sources page.
            </p>
          ) : (
            Array.from(runsBySource.values()).map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-md border bg-background p-3 text-sm"
              >
                <div>
                  <div className="font-medium">{r.source_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.started_at ? format(new Date(r.started_at), 'PPpp') : '—'}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    {r.listings_seen ?? 0} seen · {r.listings_new ?? 0} new
                  </span>
                  <Badge variant="outline">{r.status}</Badge>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
