import Link from 'next/link';
import { RoleGate } from '@/components/RoleGate';

const NAV = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/data-grid', label: 'Data grid' },
  { href: '/admin/sources', label: 'Sources' },
  { href: '/admin/runs', label: 'Runs' },
  { href: '/admin/dedup', label: 'Dedup queue' },
  { href: '/admin/health', label: 'Health' },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGate require="admin">
      <div className="container py-6">
        <div className="mb-6 flex flex-wrap items-center gap-1 border-b pb-2">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </div>
        {children}
      </div>
    </RoleGate>
  );
}
