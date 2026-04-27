import { LoginForm } from './LoginForm';

export default function LoginPage() {
  return (
    <div className="container flex min-h-[calc(100vh-3.5rem)] items-center justify-center py-12">
      <div className="crdg-card w-full max-w-md p-8">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sign in to the CRDG listings dashboard. We will email you a magic link.
        </p>
        <div className="mt-6">
          <LoginForm />
        </div>
        <p className="mt-6 text-xs text-muted-foreground">
          Realtors and admins only. Need access? Email{' '}
          <a className="underline" href="mailto:errol@costaricadreamgroup.com">
            errol@costaricadreamgroup.com
          </a>
          .
        </p>
      </div>
    </div>
  );
}
