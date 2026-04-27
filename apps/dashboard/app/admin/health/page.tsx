import { format, subDays } from 'date-fns';
import { createAdminSupabase } from "@/lib/supabase/admin";
import { CostChart, FunnelChart } from './HealthCharts';
import type { AiCostDailyRow, AlertRow, PipelineFunnelRow } from '@/lib/types';
import { Badge } from '@/components/ui/Badge';

export default async function HealthPage() {
  const supabase = createAdminSupabase();
  const since = format(subDays(new Date(), 30), 'yyyy-MM-dd');

  const [costsRes, funnelRes, alertsRes] = await Promise.all([
    supabase
      .from('ai_costs_daily')
      .select('*')
      .gte('day', since)
      .order('day', { ascending: true }),
    supabase.from('v_pipeline_funnel').select('*'),
    supabase
      .from('alerts')
      .select('id, severity, source, message, data, acknowledged_at, created_at')
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  const costs = (costsRes.data ?? []) as AiCostDailyRow[];
  const funnel = (funnelRes.data ?? []) as PipelineFunnelRow[];
  const alerts = (alertsRes.data ?? []) as AlertRow[];

  const costPoints = costs.map((d) => ({
    day: d.day,
    cost: Number(d.cost_usd ?? 0),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pipeline health</h1>
        <p className="text-sm text-muted-foreground">
          Cost, throughput, and alerts at a glance.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="crdg-card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            AI cost — last 30 days
          </h2>
          <div className="mt-3 h-64">
            <CostChart data={costPoints} />
          </div>
        </div>
        <div className="crdg-card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Pipeline funnel
          </h2>
          <div className="mt-3 h-64">
            <FunnelChart data={funnel} />
          </div>
        </div>
      </div>

      <div className="crdg-card p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Recent alerts
        </h2>
        {alerts.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No alerts in the last window.</p>
        ) : (
          <ul className="mt-3 divide-y">
            {alerts.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                <div className="flex items-start gap-3">
                  <Badge
                    variant={
                      a.severity === 'critical' || a.severity === 'error'
                        ? 'default'
                        : 'secondary'
                    }
                    className={
                      a.severity === 'critical'
                        ? 'bg-rose-600 text-white'
                        : a.severity === 'error'
                          ? 'bg-rose-500 text-white'
                          : a.severity === 'warn'
                            ? 'bg-amber-500 text-amber-950'
                            : ''
                    }
                  >
                    {a.severity}
                  </Badge>
                  <div>
                    <div className="font-medium">{a.message}</div>
                    <div className="text-xs text-muted-foreground">
                      {a.source} · {format(new Date(a.created_at), 'PPpp')}
                    </div>
                  </div>
                </div>
                {a.acknowledged_at && (
                  <span className="text-xs text-muted-foreground">acked</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
