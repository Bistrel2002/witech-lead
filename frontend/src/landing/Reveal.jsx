import { useReveal } from './useReveal.js';

/**
 * Fades and lifts its children in the first time they scroll into view.
 *
 * `delay` staggers siblings. Keep the values small — a stagger long enough
 * to notice reads as the page being slow rather than as choreography.
 */
export default function Reveal({ as: Tag = 'div', delay = 0, className = '', children, ...rest }) {
  const { ref, shown } = useReveal();

  return (
    <Tag
      ref={ref}
      data-shown={shown ? 'true' : 'false'}
      style={delay ? { '--wt-delay': `${delay}ms` } : undefined}
      className={`wt-reveal ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  );
}
