import { useId } from 'react';

const FIELD = `w-full bg-surface-2 border rounded-xl px-4 py-3 text-fg text-sm
  placeholder:text-fg-subtle transition-colors
  focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent`;

function Label({ htmlFor, children }) {
  return (
    <label htmlFor={htmlFor} className="block text-[11px] font-bold text-fg-muted uppercase tracking-wider mb-2">
      {children}
    </label>
  );
}

function Help({ error, hint }) {
  if (error) return <p className="mt-1.5 text-xs text-[var(--wt-danger)]">{error}</p>;
  if (hint) return <p className="mt-1.5 text-xs text-fg-subtle">{hint}</p>;
  return null;
}

export function Input({ label, error, hint, className = '', id: providedId, ...rest }) {
  const generatedId = useId();
  const id = providedId || generatedId;

  return (
    <div className={className}>
      {label && <Label htmlFor={id}>{label}</Label>}
      <input id={id} className={`${FIELD} ${error ? 'border-[var(--wt-danger)]' : 'border-line'}`} {...rest} />
      <Help error={error} hint={hint} />
    </div>
  );
}

export function Textarea({ label, error, hint, className = '', rows = 5, id: providedId, ...rest }) {
  const generatedId = useId();
  const id = providedId || generatedId;

  return (
    <div className={className}>
      {label && <Label htmlFor={id}>{label}</Label>}
      <textarea id={id} rows={rows} className={`${FIELD} ${error ? 'border-[var(--wt-danger)]' : 'border-line'}`} {...rest} />
      <Help error={error} hint={hint} />
    </div>
  );
}
