# Pixel Plumber 🍄

A tiny Super-Mario-like platformer built with plain HTML5 Canvas + JavaScript —
no build step, no dependencies. Works on desktop (keyboard) and on phones
(on-screen touch controls).

## Play locally

Just open `index.html` in a browser, or serve the folder:

```bash
npx serve .
# or
python -m http.server 8000
```

## Controls

- **Desktop:** Arrow keys / A-D to move, Space / Up / W to jump.
- **Phone:** On-screen ◀ ▶ buttons to move, ⤒ button to jump (bottom-right).
  Landscape orientation is recommended.

## How to win

Walk/run right, jump on platforms, stomp goombas from above (touching them
from the side costs a life), collect coins for points, and reach the flag
at the end of the level. You have 3 lives.

## Deploying to GitHub Pages

1. Push this folder to a GitHub repo (e.g. `md-simulation`).
2. In the repo settings, open **Pages**, set the source to the `main`
   branch (root), and save.
3. Your game will be live at `https://<your-username>.github.io/md-simulation/`
   — open that URL on your phone and it's playable straight away.

```bash
git init
git add .
git commit -m "Add Pixel Plumber game"
git branch -M main
git remote add origin https://github.com/<your-username>/md-simulation.git
git push -u origin main
```

## Files

- `index.html` — page structure, HUD, on-screen controls
- `style.css` — responsive/mobile layout, touch button styling
- `game.js` — game loop, physics, level data, rendering (all in one file)
