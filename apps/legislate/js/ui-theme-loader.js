// ui-theme-loader.js — v1.4.1 (safe no-op if no JSON)
(function(){
  async function loadJSON(path){
    try{ const res = await fetch(path, {cache:'no-store'}); if(!res.ok) return null; return await res.json(); }
    catch(e){ return null; }
  }
  function applyTheme(theme){
    if(!theme) return;
    const root = document.documentElement;
    const colors = theme.colors||{};
    Object.keys(colors).forEach(k=> root.style.setProperty('--ui-'+k, colors[k]));
    if(theme.fonts){
      root.style.setProperty('--ui-font-heading', theme.fonts.heading||'inherit');
      root.style.setProperty('--ui-font-body', theme.fonts.body||'inherit');
    }
  }
  function applyLayout(layout){
    // intentionally minimal; primary layout remains your app.
    // Reserved hook: can position known panels if your app exposes IDs.
  }
  window.addEventListener('DOMContentLoaded', async ()=>{
    const theme = await loadJSON('data/ui/ui-theme.json');
    const layout = await loadJSON('data/ui/ui-layout.json');
    applyTheme(theme);
    applyLayout(layout);
  });
})();
