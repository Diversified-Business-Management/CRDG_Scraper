import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export function KpiTile({
  label,
  value,
  hint,
  href,
  tone = 'default',
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  href?: string;
  tone?: 'default' | 'accent' | 'warning' | 'danger';
}) {
  const toneCls =
    tone === 'accent'
      ? 'border-accent/30 bg-accent/5'
      : tone === 'warning'
        ? 'border-amber-300/40 bg-amber-50 dark:bg-amber-950/30'
        : tone === 'danger'
          ? 'border-rose-300/40 bg-rose-50 dark:bg-rose-950/30'
          : '';
  const Inner = (
    <div className={cn('crdg-card relative h-full p-5 transition-colors', toneCls, href && 'hover:bg-secondary/30')}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        {href && <ArrowUpRight className="h-4 w-4 text-muted-foreground" />}
      </div>
      <div className="mt-2 font-mono text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
  if (href) return <Link href={href}>{Inner}</Link>;
  return Inner;
}
