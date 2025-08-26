// debug.js — feature-flagged debug panel with verbosity
(function(){
  const enabled = true;
  const verbose = true;

  function log(type, payload){
    if(!enabled) return;
    const ts = new Date().toISOString();
    console.log(`[${ts}] ${type}`, payload||"");
    if(!panel) return;

    const line = document.createElement("div");
    line.textContent = `[${ts}] ${type} ${JSON.stringify(payload)}`;
    panel.appendChild(line);
    panel.scrollTop = panel.scrollHeight;
  }

  let panel;
  function setup(){
    panel = document.createElement("div");
    panel.id = "dbg-log";
    panel.style.position = "fixed";
    panel.style.bottom = 0;
    panel.style.left = 0;
    panel.style.right = 0;
    panel.style.maxHeight = "30vh";
    panel.style.overflowY = "auto";
    panel.style.background = "rgba(0,0,0,0.8)";
    panel.style.color = "#0f0";
    panel.style.fontSize = "0.75rem";
    panel.style.fontFamily = "monospace";
    panel.style.zIndex = 2000;
    panel.style.padding = "0.25rem";

    const toggle = document.createElement("button");
    toggle.textContent = "Toggle Debug";
    toggle.style.position = "fixed";
    toggle.style.bottom = "30vh";
    toggle.style.right = "0";
    toggle.style.zIndex = 2001;
    toggle.onclick = ()=>{
      if(panel.style.display==="none"){ panel.style.display="block"; }
      else { panel.style.display="none"; }
    };

    document.body.appendChild(toggle);
    document.body.appendChild(panel);
    log("INFO","debug enabled");
  }

  window.LegislateDebug = { log };
  window.addEventListener("DOMContentLoaded", setup);
})();