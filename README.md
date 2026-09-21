# Murat Kaan Seçkin — Portfolio

A static portfolio designed as a transit map: every project is a stop, and each career line has its own colour.

## What is inside

- `index.html` — content and structure
- `styles.css` — visual system, light and dark themes
- `script.js` — route map animation, section navigation, image zoom, and four interactive pieces:
  - **Solve Stop prototype** — the tap-to-upgrade mechanic from the game design case, playable on a 5×5 board
  - **Kunduz pricing model** — Erlang B + price elasticity (e = 0.912) optimiser running live in the browser
  - **TikiTrivia "Kariyer İzi"** — a one-question career path puzzle
  - **Lee** — a step slider that grows the companion
- `assets/` — optimised visuals from the original project decks, designs and the CV

## Run locally

No build step.

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000`.

## Deploy

Works as-is on GitHub Pages (Settings → Pages → deploy from `main`), Vercel, Netlify or Cloudflare Pages.
