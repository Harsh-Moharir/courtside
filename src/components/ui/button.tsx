import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from './cn';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'success' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-contrast hover:brightness-110 font-semibold',
  secondary: 'border border-border bg-surface-2 text-fg hover:border-accent/60',
  danger: 'bg-danger text-white hover:brightness-110 font-semibold',
  success: 'bg-success text-[#052e16] hover:brightness-110 font-semibold',
  ghost: 'text-muted hover:text-fg hover:bg-surface-2',
};
const sizes: Record<ButtonSize, string> = {
  sm: 'min-h-[36px] px-3 text-sm',
  md: 'min-h-[44px] px-4 text-sm',
  lg: 'min-h-[52px] px-5 text-base',
  xl: 'min-h-[64px] px-6 text-xl font-display uppercase tracking-wide',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, className, disabled, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-btn transition disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});
