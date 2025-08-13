SI Tracker backend debug patch

Drop these files into your repo, commit to main, and re-run the Action.

- scripts/queries/base-sis.sparql  (loosened filter; includes laid step attempts)
- scripts/queries/procedure-steps-all.sparql (timeline for all WPs since SI_SINCE)
- scripts/build-data.mjs (merges timeline; writes debug.sample in build.json)
- ui/app.debug.js (optional, logs current SI object on detail pages)
