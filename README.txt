SI Tracker — Procedure & Timeline Patch
========================================

This patch brings your app in line with Parliament’s site by:
- restricting to SIs that are **laid** and **have a modelled procedure**,
- deriving **Laid** from the exact Commons/Lords laid steps,
- attaching a full **timeline** of procedure steps,
- showing **human‑readable procedure** labels in list & detail views.

Files included
--------------
apps/si-tracker-v2.1/scripts/queries/base-sis.sparql
apps/si-tracker-v2.1/scripts/queries/procedure-steps-all.sparql
apps/si-tracker-v2.1/scripts/build-data.mjs
apps/si-tracker-v2.1/ui/app.proc-timeline.patch.js

How to apply
------------
1. Drag-and-drop the contents of this zip into the **root** of your Web-Apps repo, keeping the same paths.
2. Edit `apps/si-tracker-v2.1/index.html` and add one line before `</body>` (under your existing scripts):
   <script src="./ui/app.proc-timeline.patch.js"></script>
3. Commit to `main`.
4. Run **Actions → Refresh SI data (V2.1)**.
5. Hard refresh the site. Open a detail page and verify Laid date, Procedure labels, and Timeline match Parliament.

Notes
-----
- The builder honours `SI_SINCE` (default 2024-07-04). Set it per-run if you want a different window.
- Items **without** a laid step or **without** a procedure are excluded from the dataset.
- Calendar generation still uses motions; consider adding debate/DLC step IDs later for more event types.
