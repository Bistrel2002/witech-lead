import { useEffect, useState } from 'react';
import { prefersReducedMotion } from './useReveal.js';

/**
 * A looping clock for the landing page's demo panels.
 *
 * Returns elapsed milliseconds within `cycle`. Callers derive everything
 * they render from that number, so nothing accumulates and the loop cannot
 * drift.
 *
 * Three things it gets right, each learned from a defect in the hero
 * console:
 *
 * - Time comes from the wall clock, never from counting ticks. Advancing a
 *   counter by a fixed step per callback makes the animation run at
 *   whatever rate the browser chooses to fire it — measured at ~1.7Hz in a
 *   throttled tab, which stretched a 680ms word to 11 seconds.
 * - `resolution` buckets the output so a 60fps scheduler does not force 60
 *   re-renders a second; these panels change a handful of times per cycle.
 * - If no frame arrives while the document is visible, it settles on
 *   `restAt` rather than sitting at t=0 forever. A panel whose first frame
 *   is empty must never be able to stay empty.
 *
 * Pass `active: false` to leave it parked — panels below the fold use their
 * reveal state for this, so the animation starts when the visitor arrives
 * at it and costs nothing before that.
 */
export function useCycleClock({ cycle, active = true, resolution = 80, restAt = null }) {
  const rest = restAt ?? cycle * 0.92;
  const [t, setT] = useState(() => (prefersReducedMotion() ? rest : 0));

  useEffect(() => {
    if (!active || prefersReducedMotion()) return;

    let raf = 0;
    let start = 0;
    let bucket = -1;

    const loop = (now) => {
      if (!start) start = now;
      const elapsed = (now - start) % cycle;
      const next = Math.floor(elapsed / resolution);
      if (next !== bucket) {
        bucket = next;
        setT(elapsed);
      }
      raf = window.requestAnimationFrame(loop);
    };

    raf = window.requestAnimationFrame(loop);

    const failsafe = window.setTimeout(() => {
      if (bucket === -1 && document.visibilityState === 'visible') setT(rest);
    }, 1500);

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(failsafe);
    };
  }, [cycle, active, resolution, rest]);

  return t;
}

/** Ease-out for bars and counters, so they arrive rather than stop dead. */
export function easeOut(x) {
  const c = Math.max(0, Math.min(1, x));
  return 1 - Math.pow(1 - c, 3);
}

/** Progress through a phase that runs from `from` to `to`, clamped 0..1. */
export function phase(t, from, to) {
  if (t <= from) return 0;
  if (t >= to) return 1;
  return (t - from) / (to - from);
}
