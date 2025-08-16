
Mobile Calibration Shim (Safe, Additive, No app.js edits)
=========================================================

What it does
------------
- Keeps your existing Desktop calibration *untouched*.
- When you opt-in on a phone (<= 768px wide) using ?mobilecal=1,
  it scales the Desktop calibration to the rendered board size
  and uses that for the session.
- It saves the scaled path to its own key (legislate_path_mobile_v1)
  so future loads on that device can re-use it.
- If disabled or on desktop, it forces the app to use Desktop calibration.

Install
-------
1) Copy `mobilecal-shim.js` into your game's folder:
   apps/legislate/mobilecal-shim.js

2) Edit `apps/legislate/index.html` and insert ONE line
   *before* the existing app.js script tag:

     <script src="mobilecal-shim.js"></script>

   Example placement:
     ... (head and body)
     <link rel="stylesheet" href="style.css">
     <script src="mobilecal-shim.js"></script>
     <script src="app.js"></script>
     </body></html>

Use
---
- Desktop / normal visitors (no querystring): uses your Desktop calibration.
- On phone testing: open with `?mobilecal=1`
    https://your-site/apps/legislate/?mobilecal=1
  The shim will scale the Desktop path and set it for this session.
- To go back: `?mobilecal=0` or clear the site's storage.

Notes
-----
- This is deliberately non-destructive: it never overwrites your Desktop key.
- If the board URL can't be read (e.g., CSP or network), it fails safely
  and falls back to Desktop without breaking gameplay.
- You can remove this file anytime to revert completely.
