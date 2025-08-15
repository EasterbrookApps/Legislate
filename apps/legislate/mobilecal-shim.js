/* Mobile calibration shim v2 (safe, additive, with toggle)
   - No edits to app.js; load this BEFORE app.js in index.html
   - Desktop calibration remains the source of truth
   - Optional mobile scaling based on recorded Desktop board size
   - On small screens, shows a tiny toggle button to switch MobileCal ON/OFF
*/
(function(){
  try{
    var LS = window.localStorage;
    var LEGACY   = 'legislate_path_v1';               // app reads this key
    var DESKTOP  = 'legislate_path_desktop_v1';       // desktop calibration points (JSON array)
    var DESKMETA = 'legislate_path_desktop_meta_v1';  // {w,h} recorded board size when desktop cal last used
    var MOBILE   = 'legislate_path_mobile_v1';        // mobile calibration points

    // read & persist flag
    var Q = new URLSearchParams(location.search);
    if (Q.has('mobilecal')) LS.setItem('mobilecal_enabled', Q.get('mobilecal'));
    var enabled  = LS.getItem('mobilecal_enabled') === '1';
    var isSmall  = window.matchMedia('(max-width: 768px)').matches;
    var useMobile = enabled && isSmall;

    // migrate legacy desktop path once
    try { if (!LS.getItem(DESKTOP) && LS.getItem(LEGACY)) { LS.setItem(DESKTOP, LS.getItem(LEGACY)); } } catch(e){}

    // util: ready
    function ready(fn){
      if (document.readyState !== 'loading') fn();
      else document.addEventListener('DOMContentLoaded', fn, { once: true });
    }

    function getBoardBox(){
      var el = document.querySelector('.board-img, .board-wrap');
      if (!el) return null;
      var w = el.clientWidth|0, h = el.clientHeight|0;
      return (w>0 && h>0) ? {el:el, w:w, h:h} : null;
    }

    // record desktop baseline size (non-mobile or mobile disabled)
    function maybeRecordDesktopMeta(){
      if (useMobile) return; // only record when desktop is active
      try {
        var box = getBoardBox();
        if (!box) return;
        var meta = { w: box.w, h: box.h, t: Date.now() };
        LS.setItem(DESKMETA, JSON.stringify(meta));
      } catch(e){}
    }

    function parseJSON(j){ try{ return JSON.parse(j||'null'); }catch(e){ return null; } }

    function scaleFromDesktop(pointsJSON, deskMeta, currentBox){
      var pts = parseJSON(pointsJSON);
      if (!Array.isArray(pts) || !pts.length) return null;
      var meta = (typeof deskMeta==='string') ? parseJSON(deskMeta) : deskMeta;
      if (!meta || !meta.w || !meta.h) return null;
      var sx = currentBox.w / meta.w, sy = currentBox.h / meta.h;
      var out = pts.map(function(p){
        if (!p || p.length<2) return p;
        return [ Math.round(p[0]*sx), Math.round(p[1]*sy) ];
      });
      return JSON.stringify(out);
    }

    function applyJSONToAppKey(json){
      if (json) {
        LS.setItem(MOBILE, json); // persist
        LS.setItem(LEGACY, json); // app reads this key
      }
    }

    function ensureDesktopInAppKey(){
      var d = LS.getItem(DESKTOP);
      if (d) LS.setItem(LEGACY, d);
    }

    // inject a small toggle button on small screens so you can flip without query params
    function injectToggle(){
      if (!isSmall) return;
      var btn = document.createElement('button');
      btn.textContent = enabled ? 'MobileCal: ON' : 'MobileCal: OFF';
      btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
      btn.style.cssText = [
        'position:fixed','right:12px','bottom:12px','z-index:3000','font:600 12px/1.2 system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
        'padding:9px 12px','border-radius:12px','border:1px solid #1e2a40',
        'background:'+ (enabled?'#0b5':'#333'),
        'color:#fff','opacity:0.85','box-shadow:0 4px 16px rgba(0,0,0,.25)','letter-spacing:.2px','cursor:pointer'
      ].join(';');
      btn.addEventListener('mouseenter', function(){ btn.style.opacity='1'; });
      btn.addEventListener('mouseleave', function(){ btn.style.opacity='0.9'; });
      btn.addEventListener('click', function(){
        try{
          var now = LS.getItem('mobilecal_enabled') === '1';
          LS.setItem('mobilecal_enabled', now ? '0' : '1');
          // reload preserving query but removing mobilecal= if present (not required after we set LS)
          var u = new URL(location.href);
          u.searchParams.delete('mobilecal');
          location.replace(u.toString());
        }catch(e){ location.reload(); }
      });
      document.body.appendChild(btn);
    }

    ready(function(){
      // record desktop meta as soon as we can (harmless if mobile enabled — we check inside)
      maybeRecordDesktopMeta();

      if (!useMobile){
        ensureDesktopInAppKey();
        injectToggle();
        return;
      }

      // Using mobile: try to scale from desktop using recorded dimensions
      var box = getBoardBox();
      if (!box){
        // wait briefly for layout
        var tries = 0;
        (function waitBox(){
          var b = getBoardBox();
          if (b){
            box = b;
            proceed();
            return;
          }
          if (++tries < 60) return setTimeout(waitBox, 50); // ~3s
          // timeout -> just keep desktop
          ensureDesktopInAppKey();
          injectToggle();
        })();
      } else {
        proceed();
      }

      function proceed(){
        var base = LS.getItem(DESKTOP) || LS.getItem(LEGACY);
        var meta = LS.getItem(DESKMETA);
        var scaled = scaleFromDesktop(base, meta, box);
        if (scaled) applyJSONToAppKey(scaled);
        else ensureDesktopInAppKey(); // graceful fallback
        injectToggle();
      }
    });
  }catch(e){ /* fail safe */ }
})();
