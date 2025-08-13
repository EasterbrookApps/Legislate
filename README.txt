# Minimal SI probe
This adds a minimal SPARQL + builder to *prove* Parliament's SPARQL returns SIs after SI_SINCE.

## Files
- apps/si-tracker-v2.1/scripts/queries/minimal.sparql
- apps/si-tracker-v2.1/scripts/build-minimal.mjs
- .github/workflows/probe-minimal.yml

## Run
- In GitHub → Actions → "Probe SI data (minimal)" → Run workflow.
- Optionally set SI_SINCE (default 2024-05-26).

## Check
- apps/si-tracker-v2.1/data/build.json  → schema v2.1-minimal, count, sample
- apps/si-tracker-v2.1/data/instruments.json → minimal list with id/title/laidDate

If count > 0 here, the endpoint returns data. We can then re-layer procedure/timeline filters.
