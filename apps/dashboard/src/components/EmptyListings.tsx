import Link from 'next/link';
import { Sparkles, Workflow } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { UserRole } from '@/lib/types';

export function EmptyListings({ role }: { role: UserRole }) {
  return (
    <div className="crdg-card flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent">
        <Sparkles className="h-5 w-5" />
      </div>
      <div className="space-y-1">
        <h3 className="text-lg font-semibold tracking-tight">No listings yet</h3>
        <p className="max-w-md text-sm text-muted-foreground">
          Listings will appear here as they are ingested by the pipeline. Once a source has been
          scraped, normalized, and enriched, it will show up automatically.
        </p>
      </div>
      {role === 'admin' && (
        <div className="flex gap-2">
          <Button asChild variant="accent">
            <Link href="/admin/sources">
              <Workflow className="h-4 w-4" />
              Run a scrape
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin">Open admin dashboard</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
