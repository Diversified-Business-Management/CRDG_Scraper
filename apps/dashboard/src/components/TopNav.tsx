import Link from 'next/link';
import { Building2 } from 'lucide-react';
import type { SessionUser } from '@/lib/types';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

export function TopNav({ user }: { user: SessionUser | null }) {
  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <Building2 className="h-4 w-4" />
            </span>
            <span className="text-sm tracking-tight">CRDG</span>
            <span className="text-xs text-muted-foreground">Listings Pipeline</span>
          </Link>
          {user && (
            <nav className="flex items-center gap-1 text-sm">
              <Link
                href="/listings"
                className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                Listings
              </Link>
              {user.role === 'admin' && (
                <Link
                  href="/admin"
                  className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  Admin
                </Link>
              )}
            </nav>
          )}
        </div>
        <div className="flex items-center gap-3">
          {user ? (
            <>
              <Badge variant="outline" className="font-mono text-[10px] uppercase">
                {user.role}
              </Badge>
              <span className="hidden text-sm text-muted-foreground sm:inline">{user.email}</span>
              <form action="/api/auth/sign-out" method="post">
                <Button type="submit" variant="ghost" size="sm">
                  Sign out
                </Button>
              </form>
            </>
          ) : (
            <Button asChild variant="accent" size="sm">
              <Link href="/login">Sign in</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
