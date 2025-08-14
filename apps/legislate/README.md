# Legislate?! — Web (58-space, UMD v9a.1)

This build fixes a crash introduced by a stray `useState` outside the React component.
- ✅ Hooks are only used **inside** `App()` now.
- ✅ Single `ReactDOM.createRoot(...).render(...)` path.
- ✅ Same features and styling.

## Upload on mobile
1) Open your repo path: `Web-Apps/apps/legislate/`
2) Upload/replace: `.nojekyll`, `index.html`, `style.css`, `app.js`
3) Commit with message: `UMD v9a.1`
4) Visit with cache-buster:  
   `https://easterbrookapps.github.io/Web-Apps/apps/legislate/?v=umd-v9a1`

If it still won’t load on iOS Safari, try **Settings → Safari → Clear History and Website Data**, then reopen with the cache-buster query.
