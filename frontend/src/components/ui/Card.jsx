export default function Card({
  title,
  subtitle,
  actions,
  padded = true,
  className = '',
  children
}) {
  // Deliberately NO `overflow-hidden`, even though rounded-2xl means a
  // full-bleed child under `padded={false}` — a table, typically — will paint
  // square corners over the rounded ones.
  //
  // Clipping is the wrong default here: Prospects and Campaigns are
  // table-in-card pages whose rows carry absolutely-positioned action menus,
  // and `overflow-hidden` would cut every one of those off at the card edge.
  // A hidden dropdown is a broken feature; a square corner is a blemish.
  //
  // The fix belongs to the full-bleed child, which knows whether it is the
  // last thing in the card: wrap it in `overflow-hidden rounded-b-2xl` (or
  // `rounded-2xl` when the card has no header). Pass `className` here if a
  // particular card genuinely has nothing overflowing and wants clipping.
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
