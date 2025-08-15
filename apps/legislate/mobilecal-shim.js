/* Mobile calibration shim (feature-flagged; no edits to app.js)
   Usage: add this line BEFORE your app.js in index.html:
     <script src="mobilecal-shim.js"></script>

   Enable on phone with:  ?mobilecal=1
   Disable:               ?mobilecal=0  (or clear site data)
*/
(function(){
  try{
    var LS = window.localStorage;
    var LEGACY  = 'legislate_path_v1';             // app reads this key
    var DESKTOP = 'legislate_path_desktop_v1';     // desktop calibration
    var MOBILE  = 'legislate_path_mobile_v1';      // mobile calibration

    // opt-in flag via querystring, remembered in localStorage
    var Q = new URLSearchParams(location.search);
    if (Q.has('mobilecal')) LS.setItem('mobilecal_enabled', Q.get('mobilecal'));
    var enabled = LS.getItem('mobilecal_enabled') === '1';
    var isSmall = window.matchMedia('(max-width: 768px)').matches;
    var useMobile = enabled && isSmall;

    // migrate existing legacy desktop path once
    if (!LS.getItem(DESKTOP) && LS.getItem(LEGACY)) {
      LS.setItem(DESKTOP, LS.getItem(LEGACY));
    }

    function extractBgUrl(el){
      var bg = getComputedStyle(el).backgroundImage || '';
      var m = bg.match(/url\(["']?(.*?)["']?\)/);
      return m ? m[1] : null;
    }

    function scalePathToBoard(srcJSON){
      var src;
      try{ src = JSON.parse(srcJSON || '[]'); }catch(e){ return null; }
      if(!Array.isArray(src) || !src.length) return null;

      var board = document.querySelector('.board-img, .board-wrap') || document.body;
      var cw = board.clientWidth, ch = board.clientHeight;
      if(!(cw>0 && ch>0)) return null;

      var url = extractBgUrl(board);
      if(!url) return null;

      return new Promise(function(resolve){
        var img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function(){
          var nw = img.naturalWidth || cw;
          var nh = img.naturalHeight || ch;
          var sx = cw / nw, sy = ch / nh;
          var out = src.map(function(pt){
            if(!pt || pt.length<2) return pt;
            var x = pt[0], y = pt[1];
            return [ Math.round(x * sx), Math.round(y * sy) ];
          });
          resolve(JSON.stringify(out));
        };
        img.onerror = function(){ resolve(null); };
        img.src = url;
      });
    }

    function applyProfile(json){
      if(json){
        LS.setItem(MOBILE, json);
        LS.setItem(LEGACY, json); // app will read this this session
      }
    }

    function ready(fn){
      if(document.readyState !== 'loading') fn();
      else document.addEventListener('DOMContentLoaded', fn, { once: true });
    }

    ready(function(){
      if(!useMobile){
        // Ensure app uses Desktop by default
        if (LS.getItem(DESKTOP)) { LS.setItem(LEGACY, LS.getItem(DESKTOP)); }
        return;
      }
      // Wait for the board element to exist and be sized
      var tries = 0;
      (function waitBoard(){
        var board = document.querySelector('.board-img, .board-wrap');
        if(board && board.clientWidth>0 && board.clientHeight>0){
          var base = LS.getItem(DESKTOP) || LS.getItem(LEGACY);
          if(!base){ return; }
          var p = scalePathToBoard(base);
          if(p && typeof p.then === 'function'){ p.then(applyProfile); }
          return;
        }
        if(++tries < 60) setTimeout(waitBoard, 50); // ~3 seconds max
      })();
    });
  }catch(e){ /* fail-safe: do nothing */ }
})();
