'use client';
import * as RD from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useRef } from 'react';
import { Button, type ButtonVariant } from './button';
import { cn } from './cn';

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  initialFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  /** Element to focus when the dialog opens (instead of the first focusable element). */
  initialFocus?: React.RefObject<HTMLElement | null>;
}) {
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" />
        <RD.Content
          onOpenAutoFocus={(e) => {
            if (initialFocus?.current) {
              e.preventDefault();
              initialFocus.current.focus();
            }
          }}
          className={cn(
            'fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-card border border-border bg-surface p-5 shadow-2xl',
            className,
          )}
        >
          <div className="mb-3 flex items-start justify-between gap-4">
            <RD.Title className="font-display text-2xl font-bold uppercase">{title}</RD.Title>
            <RD.Close className="rounded-btn p-2 text-muted hover:text-fg" aria-label="Close">
              <X className="h-5 w-5" />
            </RD.Close>
          </div>
          {description ? (
            <RD.Description className="mb-4 text-sm text-muted">{description}</RD.Description>
          ) : (
            <RD.Description className="sr-only">{title}</RD.Description>
          )}
          {children}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  confirmVariant = 'primary',
  onConfirm,
  loading,
  children,
  confirmDisabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  confirmVariant?: ButtonVariant;
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
  children?: React.ReactNode;
  confirmDisabled?: boolean;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} description={description} initialFocus={confirmRef}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!loading && !confirmDisabled) void onConfirm();
        }}
      >
        {children}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button ref={confirmRef} type="submit" variant={confirmVariant} loading={loading} disabled={confirmDisabled}>
            {confirmLabel}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
