Patch contents:
- apps/si-tracker-v2.1/scripts/queries/base-sis.sparql
- apps/si-tracker-v2.1/scripts/queries/procedure-steps-all.sparql
- apps/si-tracker-v2.1/scripts/build-data.mjs
- apps/si-tracker-v2.1/ui/app.detail-patch.js

Apply steps:
1) Drag these files into the repo root, keep paths.
2) Edit apps/si-tracker-v2.1/index.html and add just before </body>:
   <script src="./ui/app.detail-patch.js"></script>
3) Commit to main.
4) Run Actions → Refresh SI data (V2.1).
5) Hard-refresh the site and re-check a detail page.
