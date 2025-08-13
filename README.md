# SI Tracker V2.1 (Full stack, multi‑app ready)

Drag-and-drop this into your repo to deploy a modern SI tracker with a resilient data pipeline.

## Paths
- Place this folder at: `Web-Apps/apps/si-tracker-v2.1/`
- The included workflow goes to: `Web-Apps/.github/workflows/data.yml`

## Build data
- GitHub → **Actions → Refresh SI data (V2.1)** → Run workflow.
- Optional: set `SI_SINCE` repo/Actions variable to control history window (default `2024-07-04`).

## Frontend
- Open: `https://<username>.github.io/Web-Apps/apps/si-tracker-v2.1/`
- Tabs: Laid / Calendar / Archive / Watchlist / About
- Filters: Status, Procedure, Department, Commons-only, Currently before Parliament
- Calendar: month/week toggle (persists), event toggles
- Detail pages: Summary, Timeline, EM, Links

## Notes
- No sample data is shipped; UI will be empty until the Action writes `data/*.json`.
- Builder always writes JSON (even on errors) and logs to `data/build.json`.
