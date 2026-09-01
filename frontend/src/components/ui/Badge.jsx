const TONES = {
  neutral: 'bg-surface-2 text-fg-muted border-line',
  success: 'bg-[var(--wt-success-soft)] text-[var(--wt-success-fg)] border-[var(--wt-success)]/25',
  danger: 'bg-[var(--wt-danger-soft)] text-[var(--wt-danger-fg)] border-[var(--wt-danger)]/25',
  warning: 'bg-[var(--wt-warning-soft)] text-[var(--wt-warning-fg)] border-[var(--wt-warning)]/25',
  accent: 'bg-accent-soft text-accent border-accent/25'
};

export default function Badge({ tone = 'neutral', icon: Icon, className = '', children }) {
  // An unknown tone must not interpolate `undefined` into the class string —
  // that produces an unstyled, borderless badge. Fall back to neutral.
  const resolvedTone = TONES[tone] ? tone : 'neutral';
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border
      text-[11px] font-semibold ${TONES[resolvedTone]} ${className}`}>
      {Icon && <Icon className="w-3 h-3" />}
      {children}
    </span>
  );
}
