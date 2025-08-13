# SI Tracker V1 (static GH Pages)

Drop into `Web-Apps/apps/si-tracker/`.

**What’s new in v3**
- Inline EM rendering with highlight (no iframes)
- More robust 21‑day rule (multi‑CIF), explicit “uncertain”
- Deep links (`#id=…`) and “Copy link”
- Accessibility: focus trap, ESC to close, ARIA roles
- Virtualized list rendering
- Diff badges on cards (events/committee/21‑day)
- CSV export (RFC‑4180 safe)
- JSON feeds + ICS export for calendar
- Watchlist import/export
- Saved views + shareable filter URLs
- Service‑worker caching for `data/*.json`
- Build checks and build info

**Run data build locally**
```
node Web-Apps/apps/si-tracker/scripts/build-data.mjs
```


**Release notes:** This package is tagged **V1**. Version label is not shown in the UI; it appears in notes only.
