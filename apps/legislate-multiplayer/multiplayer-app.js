// multiplayer-app.js — Firestore-only, ES module

// 0) Ensure Firebase is ready
await window.fbReady;
const { db, auth } = window.fb || {};
const {
  doc, setDoc, getDoc, updateDoc, onSnapshot,
  collection, getDocs, serverTimestamp, runTransaction
} = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");

// ---------- always-on debug logger ----------
function dlog(msg, extra){
  const line = `[${new Date().toISOString()}] ${msg}`;
  try {
    console.log(line, extra ?? "");
    const el = document.getElementById("dbg-log");
    if (el) el.textContent += line + (extra ? " " + JSON.stringify(extra) : "") + "\n";
  } catch {}
}

// ---------- DOM helpers ----------
const $ = (id)=>document.getElementById(id);
const joinBtn = $('joinBtn');
const roomInput = $('roomCode');
const rollBtn = $('rollBtn');
const restartBtn = $('restartBtn');
const playerCountSel = $('playerCount');
const playersSection = $('playersSection');
const turnIndicator = $('turnIndicator');
const tokensLayer = $('tokensLayer');
const diceOverlay = $('diceOverlay');
const diceEl = $('dice');
const boardImg = $('boardImg');   // ✅ hoisted so all functions can use

// UI helpers
const toast = (m,o)=>window.LegislateUI?.toast?window.LegislateUI.toast(m,o):console.log('[toast]',m);
const modal = window.LegislateUI?.createModal?.();
let board = null;
let boardUI = null;

async function loadBoard() {
  const url = "https://easterbrookapps.github.io/Legislate/apps/legislate-test/assets/packs/uk-parliament/board.json";
  board = await fetch(url).then(r=>r.json());
  boardUI = window.LegislateUI?.createBoardRenderer?.({ board });
  dlog('BOARD_JSON_LOADED', { spaces: board?.spaces?.length });
  renderTokens();
}
function showDiceRoll(value, ms=900){
  if(!diceOverlay||!diceEl) return;
  diceOverlay.hidden=false;
  diceEl.className='dice rolling';
  setTimeout(()=>{ diceEl.className='dice show-'+(value||1); setTimeout(()=>diceOverlay.hidden=true,250); }, ms);
}

// ---------- State ----------
let roomCode = "";
let roomRef = null;
let myUid = auth.currentUser.uid;

let unsubRoom = null;
let unsubPlayers = null;
const fsPlayers = new Map(); // uid -> player data mirror
let roomData = null;

// ✅ cache latest players so we can re-render once board finishes loading
let latestPlayersArray = [];

// ---------- Rendering ----------
const tokenEls = new Map();
function ensureToken(id, color){
  if (tokenEls.has(id)) return tokenEls.get(id);
  const el = document.createElement('div');
  el.className = 'token';
  el.dataset.id = id;

  // inline styles so tokens work even if the stylesheet doesn't load
  el.style.position = 'absolute';                 // <-- crucial
  el.style.width = '20px';
  el.style.height = '20px';
  el.style.borderRadius = '50%';
  el.style.transform = 'translate(-50%, -50%)';   // center on left/top
  el.style.boxShadow = '0 1px 2px rgba(0,0,0,.2)';
  el.style.outline = '1px solid rgba(0,0,0,.08)';
  el.style.background = color || '#777';
  el.style.zIndex = '11';

  tokensLayer.appendChild(el);
  tokenEls.set(id, el);
  dlog('TOKEN_CREATE', { id, color });
  return el;
}
function positionToken(el, posIndex){
  if (!board) return; // ✅ guard until board ready
  const space = board.spaces.find(s=>s.index===posIndex);
  if(!space){ dlog('SPACE_NOT_FOUND', { index: posIndex }); return; }
  el.style.left = space.x + '%';
  el.style.top  = space.y + '%';

  // ✅ log computed dimensions
  const cs = getComputedStyle(el);
  dlog('TOKEN_STYLE', { 
    id: el.dataset.id, 
    left: el.style.left, 
    top: el.style.top,
    width: cs.width, 
    height: cs.height 
  });
}

// ✅ new helper to keep overlay sized & above the board
function ensureOverlayReady(){
  if (!tokensLayer) return;
  tokensLayer.style.position = 'absolute';
  tokensLayer.style.inset = '0';
  tokensLayer.style.zIndex = '10';      // above the board image
  tokensLayer.style.pointerEvents = 'none';
  dlog('OVERLAY_READY', {
    z: getComputedStyle(tokensLayer).zIndex,
    pos: getComputedStyle(tokensLayer).position
  });
}

function renderPlayersPills(players){
  playersSection.innerHTML='';
  players.sort((a,b)=> (a.seatIndex||0)-(b.seatIndex||0)).forEach(p=>{
    const pill = document.createElement('div');
    pill.className='player-pill';
    const dot=document.createElement('div'); dot.className='player-dot'; dot.style.background=p.color||'#777';
    const name=document.createElement('span'); name.className='player-name'; name.contentEditable = (p.uid===myUid)+'';
    name.textContent = p.name || 'Player';

    // commit on blur/Enter
    const commit = () => {
      if (p.uid!==myUid) return;
      const v=(name.textContent||'').trim();
      if (!v || v === p.name) return;
      updateDoc(doc(db,'rooms',roomCode,'players',myUid),{ name:v, updatedAt: serverTimestamp() })
        .then(()=> dlog('NAME_COMMIT_OK', { uid: myUid, name: v }))
        .catch((e)=> dlog('NAME_COMMIT_ERR', { msg: e?.message }));
    };
    name.addEventListener('blur', commit);
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter'){ e.preventDefault(); name.blur(); } });

    pill.appendChild(dot); pill.appendChild(name); playersSection.appendChild(pill);
  });
  dlog('PILLS_RENDERED', { count: players.length });
}

function renderTokens(){
  if (!board) { dlog('RENDER_TOKENS:board_not_ready'); return; }  // wait until board.json

  ensureOverlayReady(); // ✅ keep overlay sized and above

  const arr = latestPlayersArray?.length
    ? latestPlayersArray
    : Array.from(fsPlayers.values());

  dlog('RENDER_TOKENS:start', {
    players: arr.length,
    imgReady: !!(boardImg?.complete && boardImg?.naturalWidth)
  });

  arr.forEach(p=>{
    const el = ensureToken(p.uid, p.color);
    dlog('TOKEN_POS', { uid: p.uid, pos: p.position });
    positionToken(el, p.position||0);
  });

  boardUI?.render?.(arr); // fan-out offsets
  dlog('RENDER_TOKENS:done');
}

function updateTurnIndicator(){
  if (!roomData) return;
  const current = fsPlayers.get(roomData.currentTurnUid) ||
    Array.from(fsPlayers.values()).find(p=>p.seatIndex === (roomData.turnIndex||0));
  if (current) turnIndicator.textContent = `${current.name}'s turn`;
}
function updateRollEnabled(){
  if (!roomData) { rollBtn.disabled=true; return; }
  const present = Array.from(fsPlayers.values()).filter(p=>p.present).length >= 2;
  const myTurn = roomData.currentTurnUid === myUid;
  rollBtn.disabled = !(present && myTurn && !roomData.ended && !roomData.pendingCard);
}

// ---------- Deck utilities ----------
async function ensureRoomHasDecksAndEndIndex(){
  const snap = await getDoc(roomRef);
  const data = snap.data() || {};
  if (data.decks && data.endIndex != null) return;

  const base = "https://easterbrookapps.github.io/Legislate/apps/legislate-test/assets/packs/uk-parliament/cards";
  const [commons, early, lords, pingpong, implementation] = await Promise.all([
    fetch(`${base}/commons.json`).then(r=>r.json()),
    fetch(`${base}/early.json`).then(r=>r.json()),
    fetch(`${base}/lords.json`).then(r=>r.json()),
    fetch(`${base}/pingpong.json`).then(r=>r.json()),
    fetch(`${base}/implementation.json`).then(r=>r.json()),
  ]);
  const endIndex = (board.spaces.slice().reverse().find(s=>s.stage==='end') || board.spaces.at(-1)).index;

  await updateDoc(roomRef, { decks: { commons, early, lords, pingpong, implementation }, endIndex });
  dlog('DECKS_LOADED', { keys: Object.keys({ commons, early, lords, pingpong, implementation }).length, endIndex });
}
function spaceFor(i){ return board.spaces.find(s=>s.index===i) || null; }

// ---------- Room join / presence ----------
async function joinRoom(code, desiredCount=4){
  roomCode = (code||'').trim().toUpperCase();
  if (!roomCode) return;
  dlog('JOIN_ROOM', { code: roomCode, desiredCount });
  roomRef = doc(db,'rooms',roomCode);

  const roomSnap = await getDoc(roomRef);
  if (!roomSnap.exists()){
    await setDoc(roomRef,{
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      hostUid: myUid,
      playerCount: Number(desiredCount)||4,
      turnIndex: 0,
      currentTurnUid: myUid,
      lastRoll: 0,
      pendingCard: null,
      ended: false
    });
    dlog('ROOM_CREATED', { room: roomCode });
  }

  const playersCol = collection(roomRef,'players');
  const ps = await getDocs(playersCol);
  const taken = new Set(); ps.forEach(d=> taken.add(d.data().seatIndex));
  const total = (roomSnap.exists()? (roomSnap.data().playerCount||desiredCount) : desiredCount)|0;
  let seatIndex = 0; while (taken.has(seatIndex) && seatIndex<total) seatIndex++;

  const myRef = doc(db,'rooms',roomCode,'players',myUid);
  await setDoc(myRef,{
    uid: myUid,
    seatIndex,
    name: `Player ${seatIndex+1}`,
    color: ["#d4351c","#1d70b8","#00703c","#6f72af","#b58840","#912b88"][seatIndex%6],
    position: 0,
    skip: 0,
    extraRoll: false,
    present: true,
    updatedAt: serverTimestamp()
  },{ merge:true });
  dlog('PLAYER_UPSERTED', { uid: myUid, seatIndex });

  window.addEventListener('beforeunload', ()=> {
    try { updateDoc(myRef,{ present:false, updatedAt:serverTimestamp() }); } catch {}
  });

  unsubRoom?.(); unsubPlayers?.();

  unsubRoom = onSnapshot(roomRef, (snap)=>{
    roomData = snap.data();
    dlog('ROOM_SNAPSHOT', {
      ok: !!roomData, turnIndex: roomData?.turnIndex,
      currentTurnUid: roomData?.currentTurnUid, ended: roomData?.ended,
      pending: !!roomData?.pendingCard
    });
    updateTurnIndicator();
    updateRollEnabled();
  }, (err)=> dlog('ROOM_SNAPSHOT_ERR', { msg: err?.message }));

  unsubPlayers = onSnapshot(collection(roomRef,'players'), (qs)=>{
    fsPlayers.clear();
    qs.forEach(d=>{ const p=d.data(); fsPlayers.set(p.uid, p); });

    latestPlayersArray = Array.from(fsPlayers.values())
      .sort((a,b)=> (a.seatIndex||0) - (b.seatIndex||0));

    dlog('PLAYERS_SNAPSHOT', {
      count: latestPlayersArray.length,
      uids: latestPlayersArray.map(p=>p.uid),
      positions: latestPlayersArray.map(p=>({ uid:p.uid, pos:p.position }))
    });

    renderPlayersPills(latestPlayersArray);
    renderTokens();
    updateTurnIndicator();
    updateRollEnabled();
  }, (err)=> dlog('PLAYERS_SNAPSHOT_ERR', { msg: err?.message }));

  await ensureRoomHasDecksAndEndIndex();
  watchPendingCard();
  toast(`Joined ${roomCode}`, { kind: 'success' });
}

// ---------- Turn / Roll / Card flow ----------
function rng(){ return Math.floor(1 + Math.random()*6); }

async function actRoll(){
  dlog('ROLL_CLICK');
  await runTransaction(db, async (tx)=>{
    const rs = await tx.get(roomRef);
    if (!rs.exists()) throw new Error('room not found');
    const R = rs.data();
    if (R.ended) throw new Error('game ended');
    if (R.pendingCard) throw new Error('resolve card first');
    if (R.currentTurnUid !== myUid) throw new Error('not your turn');

    const meRef = doc(db,'rooms',roomCode,'players',myUid);
    const meSnap = await tx.get(meRef);
    const me = meSnap.data();

    const roll = rng();
    let position = me.position + roll;
    if (position < 0) position = 0;
    if (position > R.endIndex) position = R.endIndex;
    dlog('ROLL_COMPUTE', { roll, to: position });

    tx.update(roomRef, { lastRoll: roll, updatedAt: serverTimestamp() });
    tx.update(meRef, { position, updatedAt: serverTimestamp() });

    if (position === R.endIndex){
      tx.update(roomRef, { ended: true, updatedAt: serverTimestamp() });
      dlog('ENDGAME_BY_MOVE', { uid: myUid });
      return;
    }

    const space = spaceFor(position);
    if (space && space.deck && space.deck !== 'none'){
      const decks = R.decks || {};
      const deckArr = (decks[space.deck] || []).slice();
      const card = deckArr.shift() || null;
      tx.update(roomRef, {
        decks: Object.assign({}, decks, { [space.deck]: deckArr }),
        pendingCard: card ? { deck: space.deck, card } : null,
        updatedAt: serverTimestamp()
      });
      return;
    }

    const order = Array.from(fsPlayers.values()).sort((a,b)=>a.seatIndex-b.seatIndex).map(p=>p.uid);
    const idx = order.indexOf(myUid);
    const nextUid = order[(idx+1)%order.length];
    tx.update(roomRef, { currentTurnUid: nextUid, turnIndex: ((R.turnIndex||0)+1)%order.length, updatedAt: serverTimestamp() });
    dlog('TURN_ADVANCE', { nextUid, turnIndex: ((R.turnIndex||0)+1)%order.length });
  });
  showDiceRoll((roomData && roomData.lastRoll) || 1, 900);
}

async function resolveCard(){
  await runTransaction(db, async (tx)=>{
    const rs = await tx.get(roomRef);
    if (!rs.exists()) throw new Error('room not found');
    const R = rs.data();
    const pend = R.pendingCard || null;
    if (!pend) return;

    const meRef = doc(db,'rooms',roomCode,'players',myUid);
    const meSnap = await tx.get(meRef);
    const me = meSnap.data();

    const card = pend.card || {};
    const eff = String(card.effect||'');   // ✅ fixed typo
    const [type, argRaw] = eff.split(':');
    const arg = Number(argRaw||0);
    dlog('CARD_EFFECT', { effect: eff, type, arg });

    let position = me.position;
    let skip = me.skip || 0;
    let extraRoll = me.extraRoll || false;

    if (type === 'move'){ position = position + arg; }
    else if (type === 'miss_turn'){ skip = (skip||0) + 1; }
    else if (type === 'extra_roll'){ extraRoll = true; }
    else if (type === 'goto'){ position = Math.max(0, Math.min(R.endIndex, arg)); }

    if (position < 0) position = 0;
    if (position > R.endIndex) position = R.endIndex;

    tx.update(meRef, { position, skip, extraRoll, updatedAt: serverTimestamp() });

    if (position === R.endIndex){
      tx.update(roomRef, { pendingCard: null, ended: true, updatedAt: serverTimestamp() });
      dlog('ENDGAME_BY_CARD', { uid: myUid });
      return;
    }

    const order = Array.from(fsPlayers.values()).sort((a,b)=>a.seatIndex-b.seatIndex).map(p=>p.uid);
    const len = order.length;
    let currIdx = order.indexOf(myUid);
    let nextIdx = (currIdx + (extraRoll ? 0 : 1)) % len;

    let guard = 0;
    while (guard++ < len){
      const uid = order[nextIdx];
      const p = fsPlayers.get(uid);
      if (p && p.skip > 0 && uid !== myUid){
        const pref = doc(db,'rooms',roomCode,'players',uid);
        const psnap = await tx.get(pref);
        const pv = psnap.data(); const ns = Math.max(0, (pv.skip||0)-1);
        tx.update(pref,{ skip: ns, updatedAt: serverTimestamp() });
        nextIdx = (nextIdx + 1) % len;
        continue;
      }
      break;
    }

    const nextUid = order[nextIdx];
    const turnIndex = nextIdx;
    tx.update(roomRef, {
      pendingCard: null,
      currentTurnUid: nextUid,
      turnIndex,
      updatedAt: serverTimestamp()
    });
    if (extraRoll){ tx.update(meRef, { extraRoll: false, updatedAt: serverTimestamp() }); }
    dlog('TURN_ADVANCE_AFTER_CARD', { nextUid, turnIndex, extraRoll });
  });
}

// ---------- Listeners ----------
function watchPendingCard(){
  unsubRoom = onSnapshot(roomRef,(snap)=>{
    const R = snap.data(); if(!R) return;
    roomData = R;
    updateTurnIndicator(); updateRollEnabled();
    if (R.pendingCard && modal){
      const { deck, card } = R.pendingCard;
      dlog('MODAL_OPEN', { deck, title: card?.title });
      modal.open({
        title: card?.title || deck,
        body: `<p>${(card?.text||'').trim()}</p>`
      }).then(()=>{
        dlog('MODAL_OK_RESOLVE');
        resolveCard().catch(e=>toast(e.message||'Resolve failed',{kind:'error'}));
      });
    }
    if (R.ended){
      const winner = Array.from(fsPlayers.values()).find(p=>p.position===R.endIndex);
      if (winner) toast(`${winner.name} reached the end!`, { kind:'success', ttl:2600 });
    }
  }, (err)=> dlog('ROOM_LISTENER_ERR', { msg: err?.message }));
}

// ---------- UI wiring ----------
joinBtn.addEventListener('click', ()=>{
  const code = (roomInput.value||'').trim().toUpperCase();
  if (!code) return;
  joinRoom(code, playerCountSel.value).catch(e=>{
    console.error(e); toast(e.message||'Join failed',{kind:'error'});
  });
});
rollBtn.addEventListener('click', ()=>{ actRoll().catch(e=> toast(e.message||'Not your turn',{kind:'error'})); });
restartBtn.addEventListener('click', async ()=>{
  if (!roomRef) return;
  await updateDoc(roomRef,{
    ended:false, lastRoll:0, pendingCard:null, turnIndex:0, currentTurnUid: myUid, updatedAt: serverTimestamp()
  }).catch(e=> toast(e.message||'Reset denied',{kind:'error'}));
  const ps = await getDocs(collection(roomRef,'players'));
  await Promise.all(ps.docs.map(d=> updateDoc(d.ref,{ position:0, skip:0, extraRoll:false, updatedAt: serverTimestamp() }).catch(()=>{})));
  dlog('ROOM_RESET');
});

// ---------- Boot ----------
await loadBoard();
dlog('BOOT: loadBoard() done');
if (boardImg) {
  dlog('BOARD_IMG_STATUS', { complete: !!boardImg.complete, nw: boardImg.naturalWidth||0 });
  // ✅ redraw tokens once the board image has size
  if (boardImg.complete && boardImg.naturalWidth) {
    ensureOverlayReady();
    renderTokens();
  } else {
    boardImg.addEventListener('load', () => {
      dlog('BOARD_IMG_READY: load event');
      ensureOverlayReady();
      renderTokens();
    }, { once: true });
  }
}

roomInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ joinBtn.click(); }});
toast('Ready', { kind:'info', ttl: 900 });
window.addEventListener('resize', () => {
  try { ensureOverlayReady(); renderTokens(); } catch (e) { /* no-op */ }
});
dlog('BOOT_OK');