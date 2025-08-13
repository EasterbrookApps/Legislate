# Legislate?! — Web Edition (Unofficial)

A static, GitHub Pages–friendly web adaptation of the OPC training board game **Legislate?!**

- Big square board using the official board image from the repo.
- Clear current player panel with names/colours, large dice, animated movement.
- No build tools; just open `index.html` or deploy to Pages under `/apps/legislate/`.

## Deploy to GitHub Pages (folder site)
Place this folder in your Pages repo at `/apps/legislate/` and ensure `.nojekyll` exists.
Access it at `https://<username>.github.io/<repo>/apps/legislate/` (or without `<repo>` if using the special username repo).

## Customise
- Edit `app.js`:
  - Replace `DECKS` with the official card text grouped by colour.
  - Tweak `SPECIALS` indices to match where you want `?` squares.
  - Adjust `PATH` coordinates to fine-tune token locations along the printed path.
- Update the board background by changing `.board-img` in `style.css` to another image URL or a local file you add to the repo.

## Licences
- Original game content & board image: Open Government Licence v3.0 (see original authors in `alphagov/Legislate`).
- This web app code: MIT (see `LICENSE`).
