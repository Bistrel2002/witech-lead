import { useEffect, useRef, useState } from 'react';

/**
 * Reveal an element the first time it scrolls into view.
 *
 * Returns a ref to attach and the shown flag. The flag starts false, so the
 * element must carry `.wt-reveal`, whose hidden state only applies while
 * `data-shown` is not 'true'.
 *
 * Guard: if IntersectionObserver is missing, the element is shown
 * immediately rather than left invisible. A marketing page that renders
 * blank on an old browser is worse than one that does not animate.
 */
export function useReveal({ threshold = 0.18, once = true } = {}) {
  const ref = useRef(null);
  // Resolved at first render rather than in the effect: without an observer
  // there is nothing to wait for, and flipping it in the effect would cost a
  // second render and trip react-hooks/set-state-in-effect.
  const [shown, setShown] = useState(() => typeof IntersectionObserver !== 'function');

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver !== 'function') return;

    let answered = false;

    const observer = new IntersectionObserver(
      ([entry]) => {
        answered = true;
        if (entry.isIntersecting) {
          setShown(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setShown(false);
        }
      },
      { threshold, rootMargin: '0px 0px -8% 0px' }
    );

    observer.observe(el);

    // Failsafe. A revealed element starts at opacity 0 and only becomes
    // visible when the observer says so, which makes the observer a single
    // point of failure for most of the page's content — and it does not
    // always answer. In a tab that loads while hidden it stays silent
    // entirely: measured here, the whole pricing section rendered blank.
    //
    // An observer on a live page always reports the initial state almost
    // immediately, so silence this long means it is not going to answer at
    // all. Drop the hidden state rather than leave the page half empty;
    // losing an animation is nothing next to losing the content.
    const failsafe = window.setTimeout(() => {
      if (!answered) setShown(true);
    }, 1500);

    return () => {
      observer.disconnect();
      window.clearTimeout(failsafe);
    };
  }, [threshold, once]);

  return { ref, shown };
}

/** True when the visitor has asked the OS to reduce motion. */
export function prefersReducedMotion() {
  return (
    typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
