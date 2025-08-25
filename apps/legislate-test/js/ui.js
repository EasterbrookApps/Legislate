(function(){
  function setTurnIndicator(text){
    const el = document.getElementById('turnIndicator');
    if (el) el.textContent = text;
  }

  function showDiceRoll(value, durationMs){
    const overlay = document.getElementById('diceOverlay');
    const dice    = document.getElementById('dice');
    if (!dice || !overlay) return;

    const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dur = Math.max(300, prefersReduced ? 300 : (durationMs || 1200));

    overlay.hidden = false;
    overlay.style.display = 'flex';
    overlay.setAttribute('aria-hidden','false');

    // animate faces while rolling
    dice.className = 'dice rolling';
    const tempTimer = setInterval(()=>{
      const r = 1 + Math.floor(Math.random()*6);
      dice.className = 'dice rolling show-' + r;
    }, 120);

    // final face
    setTimeout(()=>{
      clearInterval(tempTimer);
      dice.className = 'dice show-' + (value || 1);
      setTimeout(()=>{
        overlay.hidden = true;
        overlay.style.display = 'none';
        overlay.setAttribute('aria-hidden','true');
      }, 450);
    }, dur);
  }

  // no-ops kept for future compatibility
  const setAlt = (id, text)=>{
    const el=document.getElementById(id);
    if (el) el.setAttribute('alt', text || '');
  };
  const setSrc = (id, src)=>{
    const el=document.getElementById(id);
    if (el) el.setAttribute('src', src || '');
  };

  function createModal(){ /* placeholder for future steps */ }
  function createBoardRenderer(){ return { placeTokens: ()=>{} }; }
  function renderPlayers(){ /* placeholder */ }

  window.LegislateUI = { setAlt, setSrc, setTurnIndicator, createModal, createBoardRenderer, renderPlayers, showDiceRoll };
})();