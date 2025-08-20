# Legislate?! v1

- White UI, SVG board wrapper, tokens move **one space at a time**.
- Floating black & white die with ~2.5s animation.
- 5 decks with blocking card modal; OK required to continue.
- Admin panel (password: `legislate`) for one-time calibration + deck mapping; **Export** downloads `board.json`.
- Fail-safe: if `data/board.json` is missing/invalid, an error screen prompts you to calibrate via Admin.

## One-time setup
1. Ensure `assets/board.png` is your real board (current source: uploaded Legislate.jpeg).
2. Open the game → **Admin** → password `legislate`.
3. **Calibration**: click 58 spaces in order.
4. **Stages**: set stage for each index.
5. **Decks**: map indices to decks (Early, Commons, Lords, Implementation, PingPong).
6. **Export** → download `board.json` and place it in `apps/legislate/data/board.json` in your repo.

## Notes
- No localStorage; everything reads from static JSON files.
- No audio. Multiplayer hooks omitted in v1.
