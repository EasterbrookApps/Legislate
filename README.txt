Backend-only fix (with debug)
--------------------------------

Files included:
- apps/si-tracker-v2.1/scripts/queries/base-sis.sparql
- apps/si-tracker-v2.1/scripts/queries/procedure-steps-all.sparql
- apps/si-tracker-v2.1/scripts/build-data.mjs
- apps/si-tracker-v2.1/ui/app.debug.js  (optional helper to log the current SI on detail pages)

Apply:
1) Drag/drop these files into your repo root, keep paths.
2) Commit & push to main.
3) Run Actions → Refresh SI data (V2.1).
4) (Optional) Add this line near the end of index.html, above </body>, to enable console logging when viewing a detail page:
   <script src="./ui/app.debug.js"></script>

Verify:
- Open /apps/si-tracker-v2.1/data/instruments.json and check an entry:
  * has laidDate (from laid step), departmentLabel, procedureKindLabel, procedureScrutinyLabel
  * has timeline[] with stepLabel/house/date
- build.json should show: { schema: "v2.1-backend-fix", count: N, since: "..." }
