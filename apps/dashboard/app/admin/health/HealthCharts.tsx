'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from 'recharts';

export function CostChart({ data }: { data: Array<{ day: string; cost: number }> }) {
  if (!data.length) {
    return <Empty msg="No AI cost data in this window." />;
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
        <XAxis dataKey="day" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip
          formatter={(value: number) => [`$${value.toFixed(2)}`, 'Cost']}
          contentStyle={{ fontSize: 12 }}
        />
        <Line
          type="monotone"
          dataKey="cost"
          stroke="hsl(38 92% 50%)"
          strokeWidth={2}
          dot={{ r: 2 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

interface FunnelDatum {
  source_slug: string;
  extracted: number;
  normalized: number;
  deduped: number;
  enriched: number;
  published: number;
  failed: number;
}

export function FunnelChart({ data }: { data: FunnelDatum[] }) {
  if (!data.length) {
    return <Empty msg="No raw listings yet — funnel will populate after the first run." />;
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
        <XAxis dataKey="source_slug" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip contentStyle={{ fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="extracted" fill="#94a3b8" />
        <Bar dataKey="normalized" fill="#64748b" />
        <Bar dataKey="enriched" fill="#f59e0b" />
        <Bar dataKey="published" fill="#10b981" />
        <Bar dataKey="failed" fill="#ef4444" />
      </BarChart>
    </ResponsiveContainer>
  );
}

function Empty({ msg }: { msg: string }) {
  return (
    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
      {msg}
    </div>
  );
}
