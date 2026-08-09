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

const DEFAULT_VARIANT = 'primary';
const DEFAULT_SIZE = 'md';

// The focus ring is drawn in --wt-fg rather than the accent: offset by 2px it
// has to read both against the page background (16.45:1 light, 16.96:1 dark)
// and against the magenta gradient it surrounds (3.76:1 on #c026d3, 3.29:1 on
// #9333ea — above the 3:1 non-text floor at both ends). An accent-coloured
// ring would sit at 1.34:1 on the gradient and effectively disappear on the
// primary button, which is the one every CTA uses.
const BASE = `inline-flex items-center justify-center font-semibold rounded-xl border
  transition-all duration-150 active:scale-[.98] cursor-pointer no-underline
  focus-visible:outline-2 focus-visible:outline-offset-2
  focus-visible:outline-[var(--wt-fg)]`;

/**
 * Button, or a link that looks like one.
 *
 * Pass `href` and it renders an <a>; pass `as` to force an element (or a
 * component, for a future router Link). Only a real <button> ever receives
 * `type` or `disabled` — emitting `type` on an anchor is invalid, and `<a
 * disabled>` does nothing at all.
 *
 * This exists because seven CTAs were written as <a><Button/></a>. HTML
 * forbids interactive descendants inside <a>: both elements take focus, so a
 * keyboard user lands on the link, then tabs onto a button where Enter and
 * Space do nothing, and a screen reader announces the same name twice — once
 * as a link, once as a button.
 */
export default function Button({
  as,
  href,
  variant = DEFAULT_VARIANT,
  size = DEFAULT_SIZE,
  loading = false,
  icon: Icon,
  className = '',
  disabled,
  type,
  children,
  ...rest
}) {
  // Fall back to the documented default rather than interpolating
  // `undefined` into the class string for an unknown value.
  const resolvedVariant = VARIANTS[variant] ? variant : DEFAULT_VARIANT;
  const resolvedSize = SIZES[size] ? size : DEFAULT_SIZE;

  const Tag = as || (href ? 'a' : 'button');
  const isRealButton = Tag === 'button';
  const isPrimary = resolvedVariant === 'primary';
  const isDisabled = Boolean(disabled || loading);

  const elementProps = isRealButton
    ? { type: type || 'button', disabled: isDisabled }
    : {
        // A disabled link is not a link: drop the href so it leaves the tab
        // order and cannot be activated, and say so to assistive tech.
        href: isDisabled ? undefined : href,
        'aria-disabled': isDisabled || undefined
      };

  return (
    <Tag
      // The gradient is the brand mark; it cannot be expressed as a single
      // token, so primary carries it inline while every other colour on the
      // button still comes from the theme.
      style={isPrimary ? { backgroundImage: 'var(--wt-gradient)' } : undefined}
      className={`${BASE}
        disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100
        ${isDisabled && !isRealButton ? 'opacity-50 cursor-not-allowed active:scale-100' : ''}
        ${VARIANTS[resolvedVariant]} ${SIZES[resolvedSize]} ${className}`}
      {...elementProps}
      {...rest}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : Icon ? <Icon className="w-4 h-4" /> : null}
      {children}
    </Tag>
  );
}
