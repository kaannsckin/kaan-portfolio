# Murat Kaan Seçkin — Portfolio

A static portfolio designed as a transit map: every project is a stop, and each career line has its own colour.

## What is inside

- `index.html` — content and structure
- `styles.css` — visual system, light and dark themes
- `i18n.js` — the Turkish and English dictionaries behind the TR/EN toggle
- `script.js` — route map animation, section navigation, image zoom, language switching, and four interactive pieces:
  - **Solve Stop prototype** — the tap-to-upgrade mechanic from the game design case, playable on a 5×5 board
  - **Kunduz pricing model** — Erlang B + price elasticity (e = 0.912) optimiser running live in the browser
  - **TikiTrivia "Kariyer İzi"** — a one-question career path puzzle
  - **Lee** — a step slider that grows the companion
- `assets/` — optimised visuals from the original project decks, designs and the CV
- `tests/smoke.mjs` — end-to-end checks

## Language

The site ships in English and Turkish. The toggle in the top bar stores the choice in
`localStorage` under `mks-lang`, falls back to the browser language, and updates `<html lang>`.

Translatable text is keyed in the markup rather than duplicated:

- `data-i18n` — replaces the element's inner HTML
- `data-i18n-alt` / `data-i18n-aria` — replace the `alt` or `aria-label` attribute
- keys under `js.` in `i18n.js` are the strings the scripts produce at runtime; `{tokens}` in them are filled in at call time

To add or change copy, edit the matching key in both `en` and `tr` in `i18n.js`. Inline markup
inside a value (such as `<b>` or an `<img>`) must match between the two languages.

## Run locally

No build step.

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000`.

## Tests

The suite drives a real browser: it screenshots 1400px and 390px in both themes, watches for
console errors, plays the Solve Stop board until the route advances, and checks the pricing
simulator against the control point from the graduation project (about 3.95 TL, 40 tutors and
roughly 94% fulfilment at the default sliders).

```bash
npm install -D playwright && npx playwright install chromium
npx http-server -p 8077 -s .      # in one terminal
node tests/smoke.mjs              # in another; screenshots land in tests/shots/
```

Set `BASE_URL` to point the suite at a deployed copy instead.

Two failures are reported but not counted, because they come from the runner rather than the
page: Playwright's Chromium is the open-source build without H.264, so it will not decode the
gameplay clip, and Google Fonts is sometimes unreachable behind a proxy.

## Deploy

Works as-is on GitHub Pages (Settings → Pages → deploy from a branch), Vercel, Netlify or
Cloudflare Pages. The sharing metadata in `index.html` points at
`https://kaannsckin.github.io/kaan-portfolio/`; change `og:url`, `og:image`, `twitter:image`
and the canonical link if the site moves to another address.
