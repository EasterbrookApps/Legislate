# SI Tracker V2.1 — Timeline patch

This patch adds a batched SPARQL query for **procedure steps** and updates the backend and UI so the **laid date**, **procedure**, and **timeline** match Parliament’s site.

## Files in this patch
- `apps/si-tracker-v2.1/scripts/queries/procedure-steps-all.sparql`
- `apps/si-tracker-v2.1/scripts/build-data.mjs` (drop-in replacement)
- `apps/si-tracker-v2.1/ui/app.detail-patch.js` (optional; improves detail rendering)

## How to apply
1. Upload these files to your repo root, preserving paths.
2. Commit to `main`.
3. Run **Actions → Refresh SI data (V2.1)**.
4. Add a `<script src="./ui/app.detail-patch.js"></script>` below your existing scripts in `apps/si-tracker-v2.1/index.html` (or replace `app.js` accordingly).
5. Refresh the site and open a detail page.

The backend will now attach `timeline` arrays to each instrument and derive an accurate `laidDate` from the official laid steps (Commons or Lords).