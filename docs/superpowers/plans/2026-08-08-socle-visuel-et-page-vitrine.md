# Socle visuel + page vitrine — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the design foundation the whole product will rest on — colour, type and spacing tokens in two themes with a working toggle, plus the base components — and ship a public landing page that lets Witech Lead be sold.

**Architecture:** A single `theme.css` defines every visual value as a CSS custom property, with a `[data-theme="dark"]` block overriding the colour tokens. Because both themes read the same variable names, components are written once and theme themselves. Tailwind v4's `@theme` directive maps the tokens onto utility classes so existing Tailwind markup keeps working. The landing page is a second Vite entry point (`landing.html`), separate from the app bundle so a visitor does not download the whole CRM.

**Tech Stack:** React 19, Vite 8, Tailwind CSS v4 (`@tailwindcss/vite`), `lucide-react` icons, Outfit + Inter fonts (already loaded in `frontend/index.html`).

## Global Constraints

- **This plan touches only `frontend/`.** No backend file, no API, no database. Not one line.
- **All user-facing copy is French.**
- **The app must display no plan badge, no quota gauge, no campaign counter, no "You are on Pro".** Nothing in the backend computes these; showing them would be inventing data. They arrive when the quota work is done. (The landing page *may* advertise plan limits — that is a commercial promise, not a system claim.)
- **Colour rule:** magenta is the action colour — buttons, links, active states. Green means success, red means error, amber means warning. Never colour a piece of data magenta for decoration, or the action colour stops meaning anything.
- **Do not add a router**, and do not add a frontend test framework.
- **Do not break `index.html` as the app entry.** OAuth redirects point at the site root (`FRONTEND_URL` in `authRoutes.js`); moving the app off the root would break Google sign-in and that is backend territory, which is out of scope.
- **Verification for every task:** `npm run lint --prefix frontend` shows **no new problems** against the baseline of **74** (68 errors, 6 warnings), `npm run build --prefix frontend` succeeds, and the result is checked visually **in both themes**.
- **Never start the dev server with the root `npm run dev`** — its `concurrently` setup leaks the frontend's `PORT` into the backend, which then dies with `EADDRINUSE`. Use `npm run dev --prefix frontend` in its own shell.

---

### Task 1: Design tokens and the two themes

The foundation. Every later task reads these variables and nothing else.

**Files:**
- Create: `frontend/src/styles/theme.css`
- Modify: `frontend/src/index.css`

**Interfaces:**
- Produces: the CSS custom properties below, available globally. Later tasks reference them as `var(--wt-accent)` etc., or through the Tailwind utilities the `@theme` block generates (`bg-surface`, `text-fg-muted`, `border-line`, …).
- Theme switching contract: the `<html>` element carries `data-theme="light"` or `data-theme="dark"`. Absence of the attribute means light.

- [ ] **Step 1: Write the token sheet**

Create `frontend/src/styles/theme.css`:

```css
/* Design tokens for Witech Lead.
 *
 * Every visual value lives here as a custom property. Components never
 * hard-code a colour: they read a token, which is what makes the second
 * theme a second set of values rather than a second design.
 *
 * Palette derived from the Wi'Tech logo: magenta -> violet gradient on a
 * deep near-black. Magenta is reserved for action; it must never be used
 * to decorate data.
 */

:root {
  /* Brand — identical in both themes, this is the logo */
  --wt-brand-500: #c026d3;
  --wt-brand-600: #a21caf;
  --wt-brand-700: #9333ea;
  --wt-brand-300: #e879f9;
  --wt-brand-100: #f5d0fe;
  --wt-gradient: linear-gradient(135deg, #c026d3 0%, #9333ea 100%);

  /* Semantic — same meaning in both themes */
  --wt-success: #16a34a;
  --wt-success-soft: #dcfce7;
  --wt-danger: #dc2626;
  --wt-danger-soft: #fee2e2;
  --wt-warning: #d97706;
  --wt-warning-soft: #fef3c7;

  /* Typography */
  --wt-font-display: 'Outfit', system-ui, sans-serif;
  --wt-font-body: 'Inter', system-ui, sans-serif;

  /* Spacing scale */
  --wt-space-1: 0.25rem;
  --wt-space-2: 0.5rem;
  --wt-space-3: 0.75rem;
  --wt-space-4: 1rem;
  --wt-space-6: 1.5rem;
  --wt-space-8: 2rem;
  --wt-space-12: 3rem;

  /* Radii */
  --wt-radius-sm: 0.5rem;
  --wt-radius: 0.75rem;
  --wt-radius-lg: 1rem;
  --wt-radius-xl: 1.25rem;

  /* Light theme surfaces and text — the default */
  --wt-bg: #f7f6fa;
  --wt-surface: #ffffff;
  --wt-surface-2: #faf9fc;
  --wt-line: #e6e1ee;
  --wt-fg: #1a1626;
  --wt-fg-muted: #6b6480;
  --wt-fg-subtle: #9a93ab;
  --wt-accent: var(--wt-brand-600);
  --wt-accent-fg: #ffffff;
  --wt-accent-soft: #fae8ff;
  --wt-shadow: 0 1px 2px rgba(26, 22, 38, .06), 0 1px 3px rgba(26, 22, 38, .04);
  --wt-shadow-lg: 0 10px 30px rgba(26, 22, 38, .10);

  /* The navigation rail is dark in both themes — it carries the brand */
  --wt-rail-bg: #140f1e;
  --wt-rail-fg: #cfc6dd;
  --wt-rail-fg-active: #ffffff;
  --wt-rail-line: #2a2038;
}

:root[data-theme='dark'] {
  --wt-bg: #0d0a14;
  --wt-surface: #17111f;
  --wt-surface-2: #1e1729;
  --wt-line: #2d2440;
  --wt-fg: #f2ecfa;
  --wt-fg-muted: #a99fbd;
  --wt-fg-subtle: #7d7391;
  --wt-accent: var(--wt-brand-300);
  --wt-accent-fg: #1a0620;
  --wt-accent-soft: #2b1436;
  --wt-shadow: 0 1px 2px rgba(0, 0, 0, .5);
  --wt-shadow-lg: 0 12px 34px rgba(0, 0, 0, .55);

  --wt-rail-bg: #120d1a;
  --wt-rail-fg: #b9aecb;
  --wt-rail-fg-active: #ffffff;
  --wt-rail-line: #251c33;

  --wt-success-soft: #082f1a;
  --wt-danger-soft: #3b0d0d;
  --wt-warning-soft: #3a2606;
}

/* Expose the tokens to Tailwind so `bg-surface`, `text-fg-muted`,
 * `border-line` etc. exist as utilities and theme themselves. */
@theme inline {
  --color-bg: var(--wt-bg);
  --color-surface: var(--wt-surface);
  --color-surface-2: var(--wt-surface-2);
  --color-line: var(--wt-line);
  --color-fg: var(--wt-fg);
  --color-fg-muted: var(--wt-fg-muted);
  --color-fg-subtle: var(--wt-fg-subtle);
  --color-accent: var(--wt-accent);
  --color-accent-fg: var(--wt-accent-fg);
  --color-accent-soft: var(--wt-accent-soft);
  --color-brand-300: var(--wt-brand-300);
  --color-brand-500: var(--wt-brand-500);
  --color-brand-600: var(--wt-brand-600);
  --color-brand-700: var(--wt-brand-700);
  --color-success: var(--wt-success);
  --color-danger: var(--wt-danger);
  --color-warning: var(--wt-warning);
  --color-rail: var(--wt-rail-bg);
  --font-display: var(--wt-font-display);
  --font-body: var(--wt-font-body);
  --radius-wt: var(--wt-radius);
  --radius-wt-lg: var(--wt-radius-lg);
}

html {
  background: var(--wt-bg);
  color: var(--wt-fg);
  font-family: var(--wt-font-body);
  color-scheme: light;
}

html[data-theme='dark'] {
  color-scheme: dark;
}

/* The theme swap should feel deliberate, not jarring — but never animate
 * on first paint, which would flash the wrong theme. */
html.wt-theme-ready body,
html.wt-theme-ready body * {
  transition: background-color .18s ease, border-color .18s ease, color .18s ease;
}
```

- [ ] **Step 2: Import it**

Replace the whole of `frontend/src/index.css` with:

```css
@import "tailwindcss";
@import "./styles/theme.css";
```

- [ ] **Step 3: Verify the build accepts the `@theme` block**

Run: `npm run build --prefix frontend`
Expected: build succeeds. Tailwind v4 parses `@theme inline`; if it errors, the import order is wrong — `tailwindcss` must come first.

- [ ] **Step 4: Verify the tokens actually resolve**

Start the dev server (`npm run dev --prefix frontend`, in its own shell), open the app, and in the browser console run:

```js
getComputedStyle(document.documentElement).getPropertyValue('--wt-accent')
```

Expected: a colour value, not an empty string. Then:

```js
document.documentElement.setAttribute('data-theme','dark');
getComputedStyle(document.documentElement).getPropertyValue('--wt-bg')
```

Expected: `#0d0a14`. Reset with `document.documentElement.removeAttribute('data-theme')`. Stop the server when done.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/styles/theme.css frontend/src/index.css
git commit -m "feat(ui): add design tokens and the light/dark theme sheet"
```

---

### Task 2: Theme state and the toggle

**Files:**
- Create: `frontend/src/hooks/useTheme.js`
- Create: `frontend/src/components/ui/ThemeToggle.jsx`
- Modify: `frontend/index.html`

**Interfaces:**
- Consumes: the `data-theme` contract from Task 1.
- Produces:
  - `useTheme()` → `{ theme: 'light' | 'dark', toggleTheme: () => void, setTheme: (t) => void }`
  - `<ThemeToggle />` — a self-contained button, no props.
  - `localStorage` key: `witech_theme`.

- [ ] **Step 1: Prevent the flash of wrong theme**

A theme read in React runs *after* first paint, so a dark-mode user sees a white flash on every load. Fix it before React boots: add this as the **last element inside `<head>`** in `frontend/index.html`:

```html
    <script>
      // Runs before first paint: apply the stored theme so a dark-mode user
      // never sees a white flash. Kept inline and tiny on purpose — a
      // separate file would load too late to help.
      (function () {
        try {
          var t = localStorage.getItem('witech_theme');
          if (!t) t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
          if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
        } catch (e) { /* private mode: fall through to light */ }
        // Enable transitions only after the initial theme is settled.
        requestAnimationFrame(function () {
          document.documentElement.classList.add('wt-theme-ready');
        });
      })();
    </script>
```

- [ ] **Step 2: Write the hook**

Create `frontend/src/hooks/useTheme.js`:

```js
import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'witech_theme';

function readInitialTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // private browsing — fall through
  }
  if (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

function applyTheme(theme) {
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState(readInitialTheme);

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // private browsing — the choice simply will not persist
    }
  }, [theme]);

  const setTheme = useCallback((next) => {
    setThemeState(next === 'dark' ? 'dark' : 'light');
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, toggleTheme, setTheme };
}
```

- [ ] **Step 3: Write the toggle**

Create `frontend/src/components/ui/ThemeToggle.jsx`:

```jsx
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';

export default function ThemeToggle({ className = '' }) {
  const { theme, toggleTheme } = useTheme();
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={dark ? 'Passer en thème clair' : 'Passer en thème sombre'}
      title={dark ? 'Thème clair' : 'Thème sombre'}
      className={`inline-flex items-center justify-center w-9 h-9 rounded-xl border border-line bg-surface text-fg-muted hover:text-accent hover:border-accent/40 transition-colors cursor-pointer ${className}`}
    >
      {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}
```

- [ ] **Step 4: Verify the flash guard and persistence**

Start the dev server. Set dark mode from the console
(`localStorage.setItem('witech_theme','dark')`), then **hard-reload**. The page
must come up dark with no white flash. Reload again and confirm it stays dark.
Stop the server.

- [ ] **Step 5: Lint and build**

Run: `npm run lint --prefix frontend` — expect **74 problems**, unchanged.
Run: `npm run build --prefix frontend` — expect success.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/hooks/useTheme.js frontend/src/components/ui/ThemeToggle.jsx frontend/index.html
git commit -m "feat(ui): add theme state, persisted toggle and flash guard"
```

---

### Task 3: Base components

The vocabulary every page will speak. Written once, themed automatically.

**Files:**
- Create: `frontend/src/components/ui/Button.jsx`
- Create: `frontend/src/components/ui/Card.jsx`
- Create: `frontend/src/components/ui/Input.jsx`
- Create: `frontend/src/components/ui/Badge.jsx`
- Create: `frontend/src/components/ui/index.js`

**Interfaces:**
- Consumes: the Tailwind utilities generated in Task 1 (`bg-surface`, `text-fg`, `border-line`, `bg-accent`, …).
- Produces, all re-exported from `frontend/src/components/ui/index.js`:
  - `<Button variant="primary|secondary|ghost|danger" size="sm|md" loading icon={Icon} {...buttonProps} />`
  - `<Card padded title subtitle actions>{children}</Card>`
  - `<Input label error hint {...inputProps} />` and `<Textarea label error hint {...textareaProps} />`
  - `<Badge tone="neutral|success|danger|warning|accent">{children}</Badge>`
  - `<ThemeToggle />` (re-exported from Task 2)

- [ ] **Step 1: Button**

Create `frontend/src/components/ui/Button.jsx`:

```jsx
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

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon: Icon,
  className = '',
  disabled,
  children,
  ...rest
}) {
  const isPrimary = variant === 'primary';
  return (
    <button
      disabled={disabled || loading}
      // The gradient is the brand mark; it cannot be expressed as a single
      // token, so primary carries it inline while every other colour on the
      // button still comes from the theme.
      style={isPrimary ? { backgroundImage: 'var(--wt-gradient)' } : undefined}
      className={`inline-flex items-center justify-center font-semibold rounded-xl border
        transition-all duration-150 active:scale-[.98] cursor-pointer
        disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100
        ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : Icon ? <Icon className="w-4 h-4" /> : null}
      {children}
    </button>
  );
}
```

- [ ] **Step 2: Card**

Create `frontend/src/components/ui/Card.jsx`:

```jsx
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
```

- [ ] **Step 3: Input and Textarea**

Create `frontend/src/components/ui/Input.jsx`:

```jsx
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
```

- [ ] **Step 4: Badge**

Create `frontend/src/components/ui/Badge.jsx`:

```jsx
const TONES = {
  neutral: 'bg-surface-2 text-fg-muted border-line',
  success: 'bg-[var(--wt-success-soft)] text-[var(--wt-success)] border-[var(--wt-success)]/25',
  danger: 'bg-[var(--wt-danger-soft)] text-[var(--wt-danger)] border-[var(--wt-danger)]/25',
  warning: 'bg-[var(--wt-warning-soft)] text-[var(--wt-warning)] border-[var(--wt-warning)]/25',
  accent: 'bg-accent-soft text-accent border-accent/25'
};

export default function Badge({ tone = 'neutral', icon: Icon, className = '', children }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border
      text-[11px] font-semibold ${TONES[tone]} ${className}`}>
      {Icon && <Icon className="w-3 h-3" />}
      {children}
    </span>
  );
}
```

- [ ] **Step 5: Barrel file**

Create `frontend/src/components/ui/index.js`:

```js
export { default as Button } from './Button.jsx';
export { default as Card } from './Card.jsx';
export { default as Badge } from './Badge.jsx';
export { default as ThemeToggle } from './ThemeToggle.jsx';
export { Input, Textarea } from './Input.jsx';
```

- [ ] **Step 6: Lint and build**

Run: `npm run lint --prefix frontend` — expect **74 problems**, unchanged. New files must contribute nothing.
Run: `npm run build --prefix frontend` — expect success.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/ui
git commit -m "feat(ui): add themed base components"
```

---

### Task 4: The landing page

A second Vite entry so a visitor does not download the CRM.

**Files:**
- Create: `frontend/landing.html`
- Create: `frontend/src/landing/main.jsx`
- Create: `frontend/src/landing/Landing.jsx`
- Create: `frontend/src/landing/Pricing.jsx`
- Modify: `frontend/vite.config.js`

**Interfaces:**
- Consumes: `frontend/src/index.css` (tokens), `frontend/src/components/ui` (Button, Badge, ThemeToggle).
- Produces: a page built to `dist/landing.html`, independent of the app bundle.

- [ ] **Step 1: Register the second entry**

`vite.config.js` currently has no `build` key. Add one, and the imports it needs, so both entries are emitted:

```js
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const here = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],
  build: {
    rollupOptions: {
      input: {
        // index stays the app: OAuth redirects point at the site root and
        // moving the app off it would break Google sign-in.
        main: path.resolve(here, 'index.html'),
        landing: path.resolve(here, 'landing.html')
      }
    }
  },
  server: {
    host: true,
    port: 5173
  }
})
```

- [ ] **Step 2: The HTML shell**

Create `frontend/landing.html` — same font links and theme guard as the app, different title and root:

```html
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/png" href="https://www.witechagency.com/logo.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="Wi'Tech Lead — le CRM de prospection qui trouve vos clients, écrit, envoie et suit vos campagnes." />
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <title>Wi'Tech Lead | Le CRM de prospection B2B</title>
    <script>
      (function () {
        try {
          var t = localStorage.getItem('witech_theme');
          if (!t) t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
          if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
        } catch (e) { /* private mode */ }
        requestAnimationFrame(function () {
          document.documentElement.classList.add('wt-theme-ready');
        });
      })();
    </script>
  </head>
  <body>
    <div id="landing-root"></div>
    <script type="module" src="/src/landing/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 3: The entry point**

Create `frontend/src/landing/main.jsx`:

```jsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import Landing from './Landing.jsx';

createRoot(document.getElementById('landing-root')).render(
  <StrictMode>
    <Landing />
  </StrictMode>
);
```

Note it imports `../index.css` directly and **not** `../main.jsx` — the landing must not pull in the app's fetch interceptor or any CRM code.

- [ ] **Step 4: The pricing grid**

Create `frontend/src/landing/Pricing.jsx`. The three plans are exactly those validated in the spec — do not adjust the numbers:

```jsx
import { Check, Mail } from 'lucide-react';
import { Button, Badge } from '../components/ui';

const CONTACT = 'mailto:contact@witechagency.com?subject=Demande%20d%27information%20Wi%27Tech%20Lead';

const PLANS = [
  {
    name: 'Starter',
    price: '49',
    pitch: 'Pour démarrer sa prospection',
    emails: '1 500 e-mails / mois',
    features: [
      'Prospects illimités',
      'Campagnes illimitées',
      '1 campagne active à la fois',
      'Recherche dans la base entreprises France',
      'Domaine d’envoi dédié',
      'Désinscription automatique',
      'Tableau de bord de suivi'
    ]
  },
  {
    name: 'Pro',
    price: '99',
    pitch: 'Pour une prospection régulière',
    emails: '5 000 e-mails / mois',
    highlighted: true,
    features: [
      'Prospects illimités',
      'Campagnes illimitées',
      '3 campagnes actives en parallèle',
      'Ciblage avancé sur la base entreprises France',
      'Domaine d’envoi dédié',
      'Désinscription automatique',
      'Tableau de bord de suivi'
    ]
  },
  {
    name: 'Agence',
    price: '249',
    pitch: 'Pour les gros volumes',
    emails: '15 000 e-mails / mois',
    features: [
      'Prospects illimités',
      'Campagnes illimitées',
      'Campagnes actives illimitées',
      'Ciblage avancé sur la base entreprises France',
      'Domaine d’envoi dédié',
      'Désinscription automatique',
      'Interlocuteur dédié'
    ]
  }
];

export default function Pricing() {
  return (
    <section id="tarifs" className="max-w-6xl mx-auto px-6 py-20">
      <div className="text-center mb-4">
        <Badge tone="accent">Essai 14 jours · 100 e-mails · sans carte bancaire</Badge>
      </div>
      <h2 className="font-display font-extrabold text-3xl md:text-4xl text-fg text-center">
        Des tarifs simples
      </h2>
      <p className="text-fg-muted text-center mt-3 mb-12 max-w-xl mx-auto">
        Prospects illimités sur tous les plans. Vous ne payez que le volume d&apos;e-mails.
      </p>

      <div className="grid md:grid-cols-3 gap-6 items-start">
        {PLANS.map((plan) => (
          <div
            key={plan.name}
            className={`relative bg-surface rounded-2xl p-7 border transition-shadow ${
              plan.highlighted
                ? 'border-accent shadow-[var(--wt-shadow-lg)] md:-mt-3'
                : 'border-line shadow-[var(--wt-shadow)]'
            }`}
          >
            {plan.highlighted && (
              <span
                style={{ backgroundImage: 'var(--wt-gradient)' }}
                className="absolute -top-3 left-1/2 -translate-x-1/2 text-white text-[10px]
                  font-bold uppercase tracking-wider px-3 py-1 rounded-full"
              >
                Le plus choisi
              </span>
            )}
            <div className="text-[11px] font-bold uppercase tracking-widest text-accent mb-3">
              {plan.name}
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-display font-extrabold text-4xl text-fg">{plan.price}</span>
              <span className="text-fg-muted font-semibold">€ /mois</span>
            </div>
            <p className="text-fg-subtle text-xs mt-2 mb-5">{plan.pitch}</p>
            <div className="h-px bg-line mb-5" />
            <div className="font-display font-bold text-fg mb-5">{plan.emails}</div>
            <ul className="space-y-2.5 mb-7">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-fg-muted">
                  <Check className="w-4 h-4 text-[var(--wt-success)] shrink-0 mt-0.5" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <a href={CONTACT} className="block">
              <Button
                variant={plan.highlighted ? 'primary' : 'secondary'}
                icon={Mail}
                className="w-full"
              >
                Nous contacter
              </Button>
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: The page itself**

Create `frontend/src/landing/Landing.jsx`:

```jsx
import { Search, PenLine, Send, LineChart, Database, ShieldCheck, Mail } from 'lucide-react';
import { Button, ThemeToggle } from '../components/ui';
import Pricing from './Pricing.jsx';

const APP_URL = '/';
const CONTACT = 'mailto:contact@witechagency.com?subject=Demande%20d%27information%20Wi%27Tech%20Lead';

const STEPS = [
  { icon: Search, title: 'Trouver', text: 'Ciblez un métier et une ville. Wi’Tech Lead extrait les entreprises depuis Google Maps et la base des sociétés françaises.' },
  { icon: PenLine, title: 'Écrire', text: 'Rédigez un modèle une fois, personnalisé automatiquement pour chaque entreprise contactée.' },
  { icon: Send, title: 'Envoyer', text: 'Vos e-mails partent depuis votre propre domaine d’envoi. Aucune configuration technique de votre part.' },
  { icon: LineChart, title: 'Suivre', text: 'Chaque prospect a un statut, chaque campagne son rapport. Vous savez où vous en êtes, en permanence.' }
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-bg font-body">

      <header className="sticky top-0 z-20 backdrop-blur bg-bg/80 border-b border-line">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div style={{ backgroundImage: 'var(--wt-gradient)' }} className="w-8 h-8 rounded-xl" />
            <span className="font-display font-extrabold text-lg text-fg">
              Wi&apos;Tech <span className="text-accent">Lead</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <a href="#tarifs" className="hidden sm:block text-sm font-semibold text-fg-muted hover:text-accent transition-colors">
              Tarifs
            </a>
            <ThemeToggle />
            <a href={APP_URL}><Button size="sm" variant="secondary">Se connecter</Button></a>
          </div>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-6 pt-20 pb-16 text-center">
        <h1 className="font-display font-extrabold text-4xl md:text-6xl text-fg leading-[1.08] max-w-4xl mx-auto">
          Le CRM de prospection qui <span className="text-accent">trouve</span> vos clients,
          puis les contacte pour vous
        </h1>
        <p className="text-fg-muted text-lg mt-6 max-w-2xl mx-auto">
          Trouvez des entreprises françaises ciblées, envoyez vos e-mails de prospection
          automatiquement, et suivez chaque réponse — dans un seul outil.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 mt-9">
          <a href={CONTACT}><Button icon={Mail}>Demander un accès</Button></a>
          <a href="#tarifs"><Button variant="secondary">Voir les tarifs</Button></a>
        </div>
        <p className="text-fg-subtle text-xs mt-4">
          Essai 14 jours · 100 e-mails inclus · sans carte bancaire
        </p>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid md:grid-cols-4 gap-5">
          {STEPS.map((s, i) => (
            <div key={s.title} className="bg-surface border border-line rounded-2xl p-6 shadow-[var(--wt-shadow)]">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-xl bg-accent-soft flex items-center justify-center">
                  <s.icon className="w-4.5 h-4.5 text-accent" />
                </div>
                <span className="text-[11px] font-bold text-fg-subtle">0{i + 1}</span>
              </div>
              <h3 className="font-display font-bold text-fg mb-2">{s.title}</h3>
              <p className="text-fg-muted text-sm leading-relaxed">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="bg-surface border border-line rounded-3xl p-8 md:p-12 shadow-[var(--wt-shadow)]">
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div>
              <div className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-accent mb-4">
                <Database className="w-3.5 h-3.5" /> Ce qui nous distingue
              </div>
              <h2 className="font-display font-extrabold text-3xl text-fg mb-4">
                La base des entreprises françaises, directement dans votre CRM
              </h2>
              <p className="text-fg-muted leading-relaxed mb-4">
                Les autres outils vous font envoyer des e-mails à une liste que vous devez
                constituer vous-même. Wi&apos;Tech Lead trouve les entreprises pour vous —
                par métier, par ville — et les fait entrer directement dans vos campagnes.
              </p>
              <p className="text-fg-muted leading-relaxed">
                Vous ne passez plus vos matinées à chercher des contacts. Vous prospectez.
              </p>
            </div>
            <div className="space-y-3">
              {[
                { icon: ShieldCheck, t: 'Un domaine d’envoi rien qu’à vous', d: 'Votre réputation d’expéditeur ne dépend d’aucun autre client.' },
                { icon: ShieldCheck, t: 'Conforme dès le premier envoi', d: 'Lien de désinscription automatique dans chaque message.' },
                { icon: ShieldCheck, t: 'Zéro configuration technique', d: 'Aucun serveur d’e-mail à paramétrer. Vous créez votre compte et vous envoyez.' }
              ].map((b) => (
                <div key={b.t} className="flex gap-3 p-4 rounded-xl bg-surface-2 border border-line">
                  <b.icon className="w-4.5 h-4.5 text-[var(--wt-success)] shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold text-fg text-sm">{b.t}</div>
                    <div className="text-fg-muted text-xs mt-1">{b.d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <Pricing />

      <section className="max-w-3xl mx-auto px-6 py-16 text-center">
        <h2 className="font-display font-extrabold text-3xl text-fg mb-3">
          Parlons de votre prospection
        </h2>
        <p className="text-fg-muted mb-8">
          Dites-nous quel métier et quelle zone vous ciblez, nous vous montrons ce que
          Wi&apos;Tech Lead trouve pour vous.
        </p>
        <a href={CONTACT}><Button icon={Mail}>contact@witechagency.com</Button></a>
      </section>

      <footer className="border-t border-line">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="text-fg-subtle text-xs">
            © {new Date().getFullYear()} Wi&apos;Tech Agency — Tous droits réservés
          </span>
          <a href={APP_URL} className="text-fg-muted hover:text-accent text-xs font-semibold transition-colors">
            Accéder à mon espace
          </a>
        </div>
      </footer>
    </div>
  );
}
```

- [ ] **Step 6: Look at it, in both themes**

Start `npm run dev --prefix frontend` in its own shell and open
**http://localhost:5173/landing.html**. Check:

- the page renders end to end, no console error
- the theme toggle in the header switches the whole page, and the choice survives a reload
- text stays readable in **both** themes — this is the risk the dual theme introduces, and there is no test to catch it
- the layout holds at a narrow window width
- the three plans show 1 500 / 5 000 / 15 000 and 49 / 99 / 249 €

Stop the server when done.

- [ ] **Step 7: Verify both bundles are emitted**

Run: `npm run build --prefix frontend`
Then: `ls frontend/dist/*.html`
Expected: **both** `index.html` and `landing.html`. If only one appears, the `rollupOptions.input` block is wrong.

- [ ] **Step 8: Lint**

Run: `npm run lint --prefix frontend` — expect **74 problems**, unchanged.

- [ ] **Step 9: Commit**

```bash
git add frontend/landing.html frontend/src/landing frontend/vite.config.js
git commit -m "feat(landing): add the public presentation and pricing page"
```

---

## Vérification

After every task: lint shows no new problems against the 74-problem baseline, the build succeeds, and anything visual has been looked at **in both themes**.

There is no automated frontend test in this project and this plan does not add one. That is a deliberate limit, not an oversight: it means a broken contrast or a layout regression is caught only by a human looking at the screen. Look properly.

## Ce que ce plan ne fait pas

The seven application pages — Login, Dashboard, LeadsManager, Campaigns, Settings, TeamSpace, AdminPanel, roughly 5 300 lines — are **not** touched here. They get their own plan, built on the tokens and components this one delivers.

Serving the landing page at the site root instead of `/landing.html` is a Vercel routing decision, not a code change, and it interacts with the OAuth redirect that currently points at the root. Left to the owner.
