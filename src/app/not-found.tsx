import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
      <p className="font-display text-7xl font-extrabold text-accent">404</p>
      <h1 className="mt-2 font-display text-3xl font-bold uppercase">Page not found</h1>
      <p className="mt-2 text-muted">That team, match or page does not exist (or was removed).</p>
      <Link href="/" className="mt-6 inline-flex min-h-[44px] items-center rounded-btn bg-accent px-5 font-semibold text-accent-contrast">
        Back to home
      </Link>
    </div>
  );
}
