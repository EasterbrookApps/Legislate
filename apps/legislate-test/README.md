# Legislate — Stable Professionalised Build

This bundle is based on your last known working `legislate-beta`, with a light professionalisation:
- Clear split of **engine**, **UI**, **loader**, and **storage** (no build step, no modules).
- **Player scaling** 2–6 (default 4), editable until first roll, then locked.
- **Inline player name editing**, with keyboard shortcuts suppressed while typing.
- **Autosave + resume** prompt.
- **Endgame** winners dialog with playful restart confirmation; preserves player count and names.
- **Token scaling & overlap** improvements.
- **Event bus** for clean engine→UI updates.
- **Friendly error screen** if content files fail to load.
- **Attribution footer** from `meta.json`.
- All **paths are relative**, so you can host from any folder (e.g. `/apps/legislate/`).

## Deploy
Just upload this folder to GitHub Pages (or any static host) and visit the URL for this directory.

## Content
- `content/uk-parliament/board.json` — board calibration (percent coords).
- `content/uk-parliament/cards/*.json` — decks (unchanged from beta).
- `content/uk-parliament/meta.json` — board image & attribution.

## Development notes
- No bundler, no module imports.
- Everything is namespaced on `window.Legislate*` for simplicity.
- Future additions (effects, packs) can hook into the event bus without touching core flow.
