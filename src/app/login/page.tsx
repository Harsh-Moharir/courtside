import type { Metadata } from 'next';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Admin sign in', robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const next = sp.next && sp.next.startsWith('/') && !sp.next.startsWith('//') ? sp.next : '/admin';
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="font-display text-4xl font-extrabold uppercase">Admin sign in</h1>
      <p className="mt-1 text-muted">Only tournament administrators can sign in. Visitors can browse everything without an account.</p>
      {sp.error === 'not_admin' && (
        <p role="alert" className="mt-4 rounded-btn border border-danger/40 bg-danger/10 px-3 py-2 text-sm">
          This account is not an administrator.
        </p>
      )}
      <LoginForm next={next} />
    </div>
  );
}
