
let Cards={decks:{},deckOrder:['early','commons','lords','implementation','pingpong'],modal:null,header:null,text:null,okBtn:null,current:null};
async function loadDecks(){
  const base='data/cards/'; const toLoad=['early','commons','lords','implementation','pingpong']; Cards.decks={};
  for(const id of toLoad){ try{ const res=await fetch(base+id+'.json?c='+Date.now()); const arr=await res.json(); Cards.decks[id]={draw:shuffle(arr.slice()),discard:[]}; }
    catch(e){ console.warn('Missing deck',id,e); Cards.decks[id]={draw:[],discard:[]}; } }
}
function drawFrom(deckId){ const d=Cards.decks[deckId]; if(!d) return null; if(d.draw.length===0){ d.draw=shuffle(d.discard.slice()); d.discard=[]; } const card=d.draw.shift()||null; if(card) d.discard.push(card); return card; }
function showCard(deckId, card){
  Cards.current={deckId,card}; const modal=$('#card-modal'); modal.classList.remove('hidden');
  modal.classList.remove('deck-early','deck-commons','deck-lords','deck-implementation','deck-pingpong');
  modal.classList.add(deckId==='early'?'deck-early':deckId==='commons'?'deck-commons':deckId==='lords'?'deck-lords':deckId==='implementation'?'deck-implementation':'deck-pingpong');
  $('#card-header').textContent=deckId.charAt(0).toUpperCase()+deckId.slice(1); $('#card-text').textContent=card.text||'—';
}
function hideCard(){ $('#card-modal').classList.add('hidden'); Cards.current=null; }
