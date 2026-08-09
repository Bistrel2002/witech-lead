export default function Card({
  title,
  subtitle,
  actions,
  padded = true,
  className = '',
  children
}) {
  return (
    <div className={`bg-surface border border-line rounded-2xl shadow-[var(--wt-shadow)] ${className}`}>
      {(title || actions) && (
        <div className="flex items-start justify-between gap-4 px-5 pt-5">
          <div>
            {title && <h3 className="font-display font-extrabold text-fg text-base">{title}</h3>}
            {subtitle && <p className="text-fg-muted text-xs mt-1">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
      )}
      <div className={padded ? 'p-5' : ''}>{children}</div>
    </div>
  );
}
