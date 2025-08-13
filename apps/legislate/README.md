# Legislate?! — Web Edition (Unofficial)

This is a tiny, no-build web app that adapts the board game **Legislate?!** (by the Office of the Parliamentary Counsel; digital repo at `alphagov/Legislate`) into a playable browser version.

> ⚠️ This is an unofficial adaptation for training/educational use. The rules and card texts here are **sample placeholders**. Replace them with the full text from the original cards to match the physical game.

## Run it
Just double-click `index.html` (or serve the folder with any static web server). It uses React from a CDN.

## Customize
- Edit `app.js`:
  - Replace `sampleDecks` with the full card content (grouped by coloured deck).
  - Adjust `specialTiles` to match your preferred board layout and number of tiles.
  - Add new `effect` types if needed; the UI already supports `move`, `skip_next`, `extra_roll`, and `jump_next_special`.

## Attribution & Licence
- Original game concept and content from the **Office of the Parliamentary Counsel**, as published in the repo [`alphagov/Legislate`](https://github.com/alphagov/Legislate), available under the **Open Government Licence v3.0**.
- This web app's **code** is provided under the **MIT License** (see `LICENSE`).
- This project is **not** affiliated with HMG or OPC.

