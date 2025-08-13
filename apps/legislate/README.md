# Legislate?! — Web Edition (58-space, stage-calibrated)

This build includes:
- **Stages** instead of colours: *Early stages*, *Commons*, *Lords*, *Implementation*.
- **58-space** path with a preattempted perimeter path you can fine-tune.
- **Calibration UI**: click to set PATH points for indices 0..58, tag stage per special square.
- **Persistence**: auto-saves PATH & stage tags to **localStorage**, with buttons to Save/Load/Clear; also **Export/Import JSON** and code snippets.
- **Blank names** allowed (UI shows P1/P2… when empty).

## Deploy
Place in your Pages repo at `/apps/legislate/` (keep `.nojekyll`). Visit with `?v=20250813e` to break caches on first load.

## Persisting calibration
- It auto-saves in the browser you’re using (localStorage).
- Use **Export JSON** to keep a copy in your repo; you can **Import JSON** later to restore exactly.
- Or export `path-58.js` and `specials-58.js` and paste into `app.js` if you want them hard-coded.
