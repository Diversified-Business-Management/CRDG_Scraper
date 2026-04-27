import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import type { UserRole } from '@/lib/types';

/**
 * Server component that 403s if the user lacks a required role. Redirects
 * unauthenticated users to /login. Renders children when authorized.
 */
export async function RoleGate({
  children,
  require,
}: {
  children: React.ReactNode;
  require: UserRole;
}) {
  const user = await getSessionUser();
  if (!user) {
    redirect('/login');
  }
  if (require === 'admin' && user.role !== 'admin') {
    return (
      <div className="container py-16">
        <div className="crdg-card max-w-lg p-8 text-center">
          <h2 className="text-xl font-semibold">Admins only</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Your account ({user.email}) does not have access to this area.
          </p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
