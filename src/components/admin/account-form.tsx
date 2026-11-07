'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { getBrowserClient } from '@/lib/supabase/browser';

/** Sets a new password for the signed-in admin; also the landing page of the password-reset email link. */
export function AccountForm() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 10) {
      setError('Use at least 10 characters.');
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setPending(true);
    const { error: err } = await getBrowserClient().auth.updateUser({ password });
    setPending(false);
    if (err) {
      setError(/same/i.test(err.message) ? 'The new password must be different from the current one.' : 'Could not change the password. Sign in again and retry.');
      return;
    }
    setPassword('');
    setConfirm('');
    toast.success('Password changed');
  }

  return (
    <Card className="p-5">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="New password" htmlFor="pw-new" hint="At least 10 characters">
          <Input id="pw-new" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Repeat new password" htmlFor="pw-confirm">
          <Input id="pw-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        {error && (
          <p role="alert" className="text-sm text-red-300">
            {error}
          </p>
        )}
        <Button type="submit" loading={pending}>
          Change password
        </Button>
      </form>
    </Card>
  );
}
