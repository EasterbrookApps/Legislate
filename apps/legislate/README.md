# Legislate?! — Web (58-space, UMD)

UMD-safe build for GitHub Pages. No ESM imports or module scripts.

## Features
- Dice final value stays visible (~1.8s)
- Per-step movement animation
- Audio (toggle), legislative facts (toggle)
- Decks for Early stages / Commons / Lords / Implementation
- Calibration (import/export JSON), persistent saves & settings
- Undo last move

## Deploy on mobile (GitHub app or browser)
1. On your phone, open your repo folder: `Web-Apps/apps/legislate/`.
2. Tap **Add file → Upload files**.
3. Select: `index.html`, `style.css`, `app.js`, `.nojekyll`.
4. Commit with message “UMD v9a”.  
5. Visit: `https://easterbrookapps.github.io/Web-Apps/apps/legislate/?v=umd-v9a`

If you’re replacing an existing folder, upload these 4 files; don’t remove your calibration JSONs — the app uses **localStorage** keys so your saved calibration remains intact.
