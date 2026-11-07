import { cn } from './cn';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-btn bg-surface-2', className)} aria-hidden />;
}

export function EmptyState({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-card border border-dashed border-border px-4 py-8 text-center text-muted', className)}>{children}</div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-card border border-danger/40 bg-danger/10 px-4 py-4 text-sm">
      <p>{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-2 font-semibold text-accent underline">
          Retry
        </button>
      )}
    </div>
  );
}

export function LiveDot({ className, label = 'Live' }: { className?: string; label?: string }) {
  return (
    <span className={cn('relative inline-flex h-2.5 w-2.5', className)} role="img" aria-label={label}>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-60" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-danger" />
    </span>
  );
}

export function TableWrap({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('scrollbar-thin w-full overflow-x-auto rounded-card border border-border', className)}>{children}</div>;
}

export function Truncate({ text, className }: { text: string; className?: string }) {
  return (
    <span className={cn('block truncate', className)} title={text}>
      {text}
    </span>
  );
}
