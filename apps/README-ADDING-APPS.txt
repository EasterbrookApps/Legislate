
Multi-App GitHub Pages (One Repo)
=================================

Structure:
  /index.html               ← catalog page linking to each app
  /.nojekyll                ← prevents Jekyll processing
  /apps/<app-name>/         ← each app in its own folder
    index.html
    app.js
    styles.css
    manifest.json
    sw.js
    icons/

Deploy (drag & drop):
  1) Create a new repo on GitHub.
  2) On the repo page: Add file → Upload files → drag the *contents* of this folder (including .nojekyll).
  3) Commit. Go to Settings → Pages:
     - Source: Deploy from a branch
     - Branch: main / (root)
  4) Your site: https://<username>.github.io/<repo>/
     - Meal Planner will be at: https://<username>.github.io/<repo>/apps/meal-planner/

Adding more apps:
  - Copy any self-contained static app into /apps/<your-app>/
  - Ensure it has its own sw.js and manifest.json inside that folder.
  - Use **relative URLs** inside the app (e.g., "./sw.js", "./styles.css", "./icons/icon-192.png")
  - In its manifest.json, set: "start_url": "./" and "display": "standalone"
  - Update the root /index.html to add a card linking to /apps/<your-app>/index.html

Service workers:
  - A service worker's scope is the folder it's served from. Keeping each app inside its own folder prevents
    interference between apps.

Deep links / 404s:
  - GitHub Pages applies 404 handling at repo root only. If an app uses a client-side router with "pretty URLs",
    prefer hash-based routing or include an in-folder 404 redirect if needed. This sample app does not use routing.

iPhone PWA notes:
  - Open the app URL in Safari → Share → Add to Home Screen.
  - Works offline after first load (HTTPS required — GitHub Pages provides HTTPS).
