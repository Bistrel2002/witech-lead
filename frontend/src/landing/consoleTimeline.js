/* The prospecting console's timeline, as pure data + one pure function.
 *
 * Kept free of React and of any DOM reference so it can be exercised
 * directly — the browser preview pane runs with visibilityState 'hidden',
 * where requestAnimationFrame never fires, so the animation cannot be
 * observed there and the logic has to be verifiable on its own.
 *
 * Every visible value is a function of elapsed milliseconds. Nothing
 * accumulates, so the loop cannot drift and a reset is just t = 0.
 */

export const TRADE = 'Plombier';
export const CITY = 'Lyon';

/* Illustrative records, not a real extraction — the console is labelled
 * "Démonstration" in the UI for exactly that reason. */
export const RESULTS = [
  { name: 'Plomberie du Rhône', area: 'Lyon 3e' },
  { name: 'Dubois & Fils', area: 'Villeurbanne' },
  { name: 'AquaService', area: 'Lyon 7e' },
  { name: 'Sanitaire Presqu’île', area: 'Lyon 2e' },
  { name: 'Chauffage Part-Dieu', area: 'Lyon 3e' },
  { name: 'Artisan Croix-Rousse', area: 'Lyon 4e' }
];

export const TOTAL_FOUND = 47;

const CHAR_EVERY = 85;
const TRADE_START = 500;
const CITY_START = TRADE_START + TRADE.length * CHAR_EVERY + 420;
const SEARCH_START = CITY_START + CITY.length * CHAR_EVERY + 260;
const ROWS_START = SEARCH_START + 700;
const ROW_EVERY = 260;
const SENT_AFTER = 900;
const HOLD = 2600;

export const T = {
  tradeStart: TRADE_START,
  charEvery: CHAR_EVERY,
  cityStart: CITY_START,
  searchStart: SEARCH_START,
  rowsStart: ROWS_START,
  rowEvery: ROW_EVERY,
  sentAfter: SENT_AFTER,
  hold: HOLD
};

export const CYCLE = ROWS_START + RESULTS.length * ROW_EVERY + SENT_AFTER + HOLD;

function typed(text, t, startAt) {
  if (t < startAt) return '';
  const chars = Math.floor((t - startAt) / CHAR_EVERY);
  return text.slice(0, Math.max(0, Math.min(text.length, chars)));
}

/** Everything the console renders at elapsed time `t`. */
export function frameAt(t) {
  const trade = typed(TRADE, t, TRADE_START);
  const city = typed(CITY, t, CITY_START);

  const visible =
    t < ROWS_START
      ? 0
      : Math.min(RESULTS.length, Math.floor((t - ROWS_START) / ROW_EVERY) + 1);

  const sentCount = Math.max(
    0,
    Math.min(
      RESULTS.length,
      Math.floor((t - ROWS_START - SENT_AFTER) / ROW_EVERY) + 1
    )
  );

  // The counter runs up alongside the rows, then rests on the real total.
  const count = Math.round(
    TOTAL_FOUND * Math.min(1, (visible / RESULTS.length) * 1.15)
  );

  return {
    trade,
    city,
    searching: t >= SEARCH_START && t < ROWS_START,
    // Before the search fires there is no count to show — "0 entreprises
    // trouvées" reads as a failed search rather than as not-yet-run.
    started: t >= SEARCH_START,
    typingTrade: t >= TRADE_START && trade.length < TRADE.length,
    typingCity: t >= CITY_START && city.length < CITY.length,
    visible,
    sentCount,
    count
  };
}

/** A cheap identity for a frame, so renderers can skip unchanged states.
 *
 * Must cover every field the console actually renders. The caret flags were
 * missing at first, which stalled each caret by one character interval: at
 * t = tradeStart the text is still empty and only typingTrade flips, so the
 * key was unchanged and the render was skipped. */
export function frameKey(f) {
  return [
    f.trade,
    f.city,
    f.visible,
    f.sentCount,
    f.searching,
    f.started,
    f.typingTrade,
    f.typingCity
  ].join('|');
}
