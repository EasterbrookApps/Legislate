// multiplayer-app.js — Firestore-only, ES module

// 0) Ensure Firebase is ready
await window.fbReady;
const { db, auth } = window.fb || {};
const {
  doc, setDoc, getDoc, updateDoc, onSnapshot,
  collection, getDocs, serverTimestamp, runTransaction
} = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");

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
const boardImg = $('boardImg');
const diceEl = $('dice');

// UI helpers
const toast = (m,o)=>window.LegislateUI?.toast?window.LegislateUI.toast(m,o):console.log('[toast]',m);
const modal = window.LegislateUI?.createModal?.();
let board = null;
let boardUI = null;

async function loadBoard() {
  const url = "https://easterbrookapps.github.io/Legislate/apps/legislate-test/assets/packs/uk-parliament/board.json";
  board = await fetch(url).then(r=>r.json());
  boardUI = window.LegislateUI?.createBoardRenderer?.({ board });
}
function showDiceRoll(value, ms=900){
  if(!diceOverlay||!diceEl) return;
  diceOverlay.hidden=false;
  diceEl.className='dice rolling';
  setTimeout(()=>{ diceEl.className='dice show-'+(value||1); setTimeout(()=>diceOverlay.hidden=true,250); }, ms);
}

function ensureOverlayReady(){
  if (!tokensLayer) return;
  tokensLayer.style.position = 'absolute';
  tokensLayer.style.inset = '0';        // cover the board
  tokensLayer.style.zIndex = '10';      // put above the board
  tokensLayer.style.pointerEvents = 'none'; // don’t block clicks
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
  el.className='token';
  el.dataset.id=id;
  el.style.background=color||'#777';
  el.style.zIndex = '5';
  tokensLayer.appendChild(el);
  tokenEls.set(id, el);
  return el;
}
function positionToken(el, posIndex){
  if (!board) return; // ✅ guard until board ready
  const space = board.spaces.find(s=>s.index===posIndex);
  if(!space) return;
  el.style.left = space.x + '%';
  el.style.top  = space.y + '%';
}
function renderPlayersPills(players){
  playersSection.innerHTML='';
  players.sort((a,b)=> (a.seatIndex||0)-(b.seatIndex||0)).forEach(p=>{
    const pill = document.createElement('div');
    pill.className='player-pill';
    const dot=document.createElement('div'); dot.className='player-dot'; dot.style.background=p.color||'#777';
    const name=document.createElement('span'); name.className='player-name'; name.contentEditable = (p.uid===myUid)+'';
    name.textContent = p.name || 'Player';

    // ✅ commit on blur/Enter (avoid snapshot fighting the caret)
    const commit = () => {
      if (p.uid!==myUid) return;
      const v=(name.textContent||'').trim();
      if (!v || v === p.name) return;
      updateDoc(doc(db,'rooms',roomCode,'players',myUid),{ name:v, updatedAt: serverTimestamp() }).catch(()=>{});
    };
    name.addEventListener('blur', commit);
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter'){ e.preventDefault(); name.blur(); } });

    pill.appendChild(dot); pill.appendChild(name); playersSection.appendChild(pill);
  });
}
function renderTokens(){
  if (!board) return;  // wait until board JSON is loaded
  ensureOverlayReady();
  // ✅ make sure the token layer matches the board image
  if (boardImg) {
    const w = boardImg.clientWidth;
    const h = boardImg.clientHeight;
    if (w && h && tokensLayer) {
      tokensLayer.style.position = 'absolute';
      tokensLayer.style.inset = '0';
      tokensLayer.style.zIndex = '10';  // keep above the board
    }
  }

  const arr = latestPlayersArray?.length
    ? latestPlayersArray
    : Array.from(fsPlayers.values());

  arr.forEach(p=>{
    const el = ensureToken(p.uid, p.color);
    positionToken(el, p.position||0);
  });

  boardUI?.render?.(arr);  // fan-out offsets
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
}
function spaceFor(i){ return board.spaces.find(s=>s.index===i) || null; }

// ---------- Room join / presence ----------
async function joinRoom(code, desiredCount=4){
  roomCode = (code||'').trim().toUpperCase();
  if (!roomCode) return;
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

  window.addEventListener('beforeunload', ()=> {
    try { updateDoc(myRef,{ present:false, updatedAt:serverTimestamp() }); } catch {}
  });

  unsubRoom?.(); unsubPlayers?.();

  unsubRoom = onSnapshot(roomRef, (snap)=>{
    roomData = snap.data();
    updateTurnIndicator();
    updateRollEnabled();
  });

  unsubPlayers = onSnapshot(collection(roomRef,'players'), (qs)=>{
    fsPlayers.clear();
    qs.forEach(d=>{ const p=d.data(); fsPlayers.set(p.uid, p); });

    // ✅ keep a sorted copy for token renders even if board isn't ready yet
    latestPlayersArray = Array.from(fsPlayers.values()).sort((a,b)=>a.seatIndex-b.seatIndex);

    renderPlayersPills(latestPlayersArray);
    renderTokens();                 // safe: no-op until board exists, then we call again after load
    updateTurnIndicator();
    updateRollEnabled();
  });

  await ensureRoomHasDecksAndEndIndex();
  watchPendingCard();
  toast(`Joined ${roomCode}`, { kind: 'success' });
}

// ---------- Turn / Roll / Card flow ----------
function rng(){ return Math.floor(1 + Math.random()*6); }

async function actRoll(){
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

    tx.update(roomRef, { lastRoll: roll, updatedAt: serverTimestamp() });
    tx.update(meRef, { position, updatedAt: serverTimestamp() });

    if (position === R.endIndex){
      tx.update(roomRef, { ended: true, updatedAt: serverTimestamp() });
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
    const eff = String(card.effect||'');
    const [type, argRaw] = eff.split(':');
    const arg = Number(argRaw||0);

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
      modal.open({
        title: card?.title || deck,
        body: `<p>${(card?.text||'').trim()}</p>`
      }).then(()=> resolveCard().catch(e=>toast(e.message||'Resolve failed',{kind:'error'})));
    }
    if (R.ended){
      const winner = Array.from(fsPlayers.values()).find(p=>p.position===R.endIndex);
      if (winner) toast(`${winner.name} reached the end!`, { kind:'success', ttl:2600 });
    }
  });
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
});

// ---------- Boot ----------
await loadBoard();

// ✅ make sure tokens get drawn once the board image has loaded
const boardImg = $('boardImg');
if (boardImg) {
  if (boardImg.complete) {
    renderTokens();                 // image is already loaded
  } else {
    boardImg.addEventListener('load', () => {
      renderTokens();               // run once when the picture finishes
    }, { once: true });
  }
}

roomInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ joinBtn.click(); }});
toast('Ready', { kind:'info', ttl: 900 });