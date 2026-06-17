import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatUsd(n: number | null | undefined, opts?: { compact?: boolean }): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  if (opts?.compact && n >= 1_000_000) {
    return `$${(n / 1_000_000).toFixed(2)}M`;
  }
  if (opts?.compact && n >= 1_000) {
    return `$${(n / 1_000).toFixed(0)}K`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('en-US').format(n);
}

export function regionLabel(slug: string | null | undefined): string {
  if (!slug) return '—';
  return slug
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}

export function statusColor(status: string | null | undefined): string {
  switch (status) {
    case 'active':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300';
    case 'draft':
      return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300';
    case 'pending_review':
      return 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300';
    case 'sold':
      return 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300';
    case 'withdrawn':
      return 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300';
    case 'stale':
      return 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400';
    case 'succeeded':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300';
    case 'failed':
      return 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300';
    case 'running':
      return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300';
    case 'partial':
      return 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300';
    case 'paused':
      return 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300';
  }
}

export const DEV_FAKE_AUTH = process.env.NEXT_PUBLIC_DEV_FAKE_AUTH === 'true';
