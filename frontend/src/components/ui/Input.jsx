const FIELD = `w-full bg-surface-2 border rounded-xl px-4 py-3 text-fg text-sm
  placeholder:text-fg-subtle transition-colors
  focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent`;

function Label({ children }) {
  return (
    <label className="block text-[11px] font-bold text-fg-muted uppercase tracking-wider mb-2">
      {children}
    </label>
  );
}

function Help({ error, hint }) {
  if (error) return <p className="mt-1.5 text-xs text-[var(--wt-danger)]">{error}</p>;
  if (hint) return <p className="mt-1.5 text-xs text-fg-subtle">{hint}</p>;
  return null;
}

export function Input({ label, error, hint, className = '', ...rest }) {
  return (
    <div className={className}>
      {label && <Label>{label}</Label>}
      <input className={`${FIELD} ${error ? 'border-[var(--wt-danger)]' : 'border-line'}`} {...rest} />
      <Help error={error} hint={hint} />
    </div>
  );
}

export function Textarea({ label, error, hint, className = '', rows = 5, ...rest }) {
  return (
    <div className={className}>
      {label && <Label>{label}</Label>}
      <textarea rows={rows} className={`${FIELD} ${error ? 'border-[var(--wt-danger)]' : 'border-line'}`} {...rest} />
      <Help error={error} hint={hint} />
    </div>
  );
}
