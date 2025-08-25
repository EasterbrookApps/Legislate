// UI helpers: modal, dice overlay, token renderer, with precise token centring
window.LegislateUI = (function(){
  function setTurnIndicator(text){
    const el = document.getElementById('turnIndicator');
    if (el) el.textContent = text;
  }

  function createModal(){
    const root = document.getElementById('modalRoot');
    if (!root) throw new Error('modalRoot missing');

    function open({ title='', body='', actions=[{id:'ok',label:'OK'}] }={}){
      root.innerHTML = `
        <div class="modal-backdrop">
          <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
            <h2 id="modalTitle">${title}</h2>
            <div id="modalBody">${body}</div>
            <div class="modal-actions">
              ${actions.map(a=>`<button class="button" id="modal-${a.id}">${a.label}</button>`).join('')}
            </div>
          </div>
        </div>`;
      return new Promise(resolve=>{
        actions.forEach(a=>{
          const btn = document.getElementById(`modal-${a.id}`);
          if (btn) btn.onclick = () => { root.innerHTML=''; resolve(a.id); };
        });
      });
    }
    return { open };
  }

  // Dice overlay: always builds faces, always resolves, and stores a "last promise" hook for the app
  let lastDicePromise = Promise.resolve();
  function getLastDicePromise(){ return lastDicePromise; }

  async function showDiceRoll(value, durationMs = 900){
    const overlay = document.getElementById('diceOverlay');
    const dice = document.getElementById('dice');
    if (!overlay || !dice) return;

    // build faces once
    if (!dice.querySelector('.face.one')){
      dice.innerHTML = `
        <div class="face one"></div>
        <div class="face two"></div>
        <div class="face three"></div>
        <div class="face four"></div>
        <div class="face five"></div>
        <div class="face six"></div>`;
    }

    lastDicePromise = (async () => {
      overlay.hidden = false;
      overlay.style.display = 'flex';

      let temp;
      try{
        dice.className = 'dice rolling show-1';
        temp = setInterval(()=> {
          const r = 1 + Math.floor(Math.random()*6);
          dice.className = 'dice rolling show-' + r;
        }, 120);

        await new Promise(r => setTimeout(r, durationMs));
        if (temp) clearInterval(temp);
        dice.className = 'dice show-' + (value || 1);
        await new Promise(r => setTimeout(r, 500)); // hold result briefly
      } finally {
        if (temp) clearInterval(temp);
        overlay.style.display = 'none';
        overlay.hidden = true;
      }
    })();

    return lastDicePromise;
  }

  // Token renderer: uses pure percentage positioning and CSS translate for exact centring
  function createBoardRenderer({ board }){
    const layer = document.getElementById('tokensLayer');
    if (!layer) throw new Error('tokensLayer missing');

    function render(players){
      layer.innerHTML = '';
      const byIndex = new Map(board.spaces.map(s => [s.index, s]));
      const n = players.length;

      players.forEach((p, i) => {
        const s = byIndex.get(p.pos ?? p.position ?? 0) || byIndex.get(0);
        const dot = document.createElement('div');
        dot.className = 'player-dot';
        dot.style.background = p.color || '#d4351c';

        // exact centring on coordinate; slight vertical stagger if multiple tokens share a space
        const x = Number(s?.x ?? 0);
        const y = Number(s?.y ?? 50) + (n > 1 ? (i - (n - 1)/2) * 3 : 0);

        dot.style.left = x + '%';
        dot.style.top  = y + '%';
        layer.appendChild(dot);
      });
    }

    return { render };
  }

  return {
    setTurnIndicator,
    createModal,
    showDiceRoll,
    createBoardRenderer,
    getLastDicePromise
  };
})();