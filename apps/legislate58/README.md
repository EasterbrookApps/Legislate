# Legislate?! — Web Edition (58-space board, specials calibration)

This build adds:
- Calibration for **0..58** (Start=0, Finish=58).
- UI to **tag special squares by colour** (red/green/blue/yellow) and export them.
- Player names can be **left blank** — tokens/sidebars show **P1/P2…** if empty.

## Deploy (GitHub Pages)
Put this folder at `/apps/legislate58/` (ensure `.nojekyll` exists).

## Calibrate
1. Toggle **Calibration mode**.
2. With **Index** shown, click the centre of each square **0..58**.
3. Tag special squares by colour (buttons) for the selected index.
4. Export **PATH (path-58.js)** and **specials (specials-58.js)** and paste them into `app.js` to persist.
