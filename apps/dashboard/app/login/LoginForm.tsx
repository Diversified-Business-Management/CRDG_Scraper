'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const FAKE = process.env.NEXT_PUBLIC_DEV_FAKE_AUTH === 'true';

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('loading');
    setErrorMsg(null);
    try {
      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? 'Failed to send magic link');
      }
      setStatus('sent');
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error');
    }
  }

  if (FAKE) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          NEXT_PUBLIC_DEV_FAKE_AUTH is enabled — you are auto-signed-in as
          demo-admin. Real auth is bypassed.
        </div>
        <Button asChild variant="accent" className="w-full">
          <a href="/listings">Continue as demo admin</a>
        </Button>
      </div>
    );
  }

  if (status === 'sent') {
    return (
      <div className="rounded-lg border bg-secondary/40 p-4 text-sm">
        <div className="font-medium">Check your email.</div>
        <p className="mt-1 text-muted-foreground">
          We sent a magic link to <span className="font-mono">{email}</span>. Click it to sign in.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label className="text-sm font-medium" htmlFor="email">
        Email
      </label>
      <Input
        id="email"
        name="email"
        type="email"
        required
        placeholder="you@costaricadreamgroup.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
      />
      <Button type="submit" variant="accent" className="w-full" disabled={status === 'loading'}>
        {status === 'loading' ? 'Sending…' : 'Send magic link'}
      </Button>
      {errorMsg && (
        <p className="text-sm text-destructive">{errorMsg}</p>
      )}
    </form>
  );
}
