'use client';
import { useState } from 'react';
import { getBrowserClient } from '@/lib/supabase/browser';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';

export function LoginForm({ next, onSuccess }: { next?: string; onSuccess?: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const { error: err } = await getBrowserClient().auth.signInWithPassword({ email: email.trim(), password });
    setPending(false);
    if (err) {
      // One generic message for every failure (no account enumeration).
      setError('Invalid email or password');
      return;
    }
    if (onSuccess) onSuccess();
    else {
      // Full navigation: a client-side transition could reuse a prefetched (signed-out) redirect for /admin.
      window.location.assign(next ?? '/admin');
    }
  }

  async function reset() {
    if (!email.trim()) {
      setError('Enter your email first, then choose Forgot password.');
      return;
    }
    await getBrowserClient().auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/admin/account` });
    setResetSent(true);
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
      <Field label="Email" htmlFor="email">
        <Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}
      {resetSent && <p className="text-sm text-muted">If that account exists, a reset link has been sent.</p>}
      <div className="flex items-center justify-between gap-3">
        <Button type="submit" loading={pending} size="lg">
          Sign in
        </Button>
        {!onSuccess && (
          <button type="button" onClick={reset} className="text-sm text-muted underline hover:text-fg">
            Forgot password
          </button>
        )}
      </div>
    </form>
  );
}
