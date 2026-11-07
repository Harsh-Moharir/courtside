'use client';

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
      <h1 className="font-display text-3xl font-bold uppercase">Something went wrong</h1>
      <p className="mt-2 text-muted">The page could not be loaded. Check your connection and try again.</p>
      <button type="button" onClick={reset} className="mt-6 min-h-[44px] rounded-btn bg-accent px-5 font-semibold text-accent-contrast">
        Retry
      </button>
    </div>
  );
}
