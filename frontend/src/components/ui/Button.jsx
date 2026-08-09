import { Loader2 } from 'lucide-react';

const VARIANTS = {
  primary: 'text-white border-transparent shadow-sm hover:brightness-110',
  secondary: 'bg-surface text-fg border-line hover:border-accent/40 hover:text-accent',
  ghost: 'bg-transparent text-fg-muted border-transparent hover:bg-surface-2 hover:text-fg',
  danger: 'bg-transparent text-[var(--wt-danger)] border-[var(--wt-danger)]/30 hover:bg-[var(--wt-danger)]/10'
};

const SIZES = {
  sm: 'text-xs px-3 py-2 gap-1.5',
  md: 'text-sm px-5 py-2.5 gap-2'
};

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon: Icon,
  className = '',
  disabled,
  children,
  ...rest
}) {
  const isPrimary = variant === 'primary';
  return (
    <button
      disabled={disabled || loading}
      // The gradient is the brand mark; it cannot be expressed as a single
      // token, so primary carries it inline while every other colour on the
      // button still comes from the theme.
      style={isPrimary ? { backgroundImage: 'var(--wt-gradient)' } : undefined}
      className={`inline-flex items-center justify-center font-semibold rounded-xl border
        transition-all duration-150 active:scale-[.98] cursor-pointer
        disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100
        ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : Icon ? <Icon className="w-4 h-4" /> : null}
      {children}
    </button>
  );
}
