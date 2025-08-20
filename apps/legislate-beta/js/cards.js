// cards.js — effects-only patch: shows card and dispatches effect on OK (no dice/engine changes)
let Cards={decks:{},current:null};

async function loadDecks(){
  const ids=['early','commons','lords','implementation','pingpong'];
  Cards.decks={};
  for(const id of ids){
    try{
      const res=await fetch('data/cards/'+id+'.json?c='+(Date.now()));
      const arr=await res.json();
      Cards.decks[id]={draw:arr.slice(),discard:[]};
    }catch(e){ Cards.decks[id]={draw:[],discard:[]}; }
  }
}

function drawFrom(deckId){
  const d=Cards.decks[deckId]; if(!d) return null;
  if(d.draw.length===0){ d.draw=d.discard.slice(); d.discard=[]; }
  const card=d.draw.shift()||null; if(card) d.discard.push(card);
  return card;
}

function showCard(deckId, card){
  Cards.current={deckId,card};
  let modal=document.getElementById('card-modal');
  if(!modal){
    modal=document.createElement('div'); modal.id='card-modal'; modal.className='overlay';
    modal.innerHTML='<div class="card card-modal"><div id="card-header" class="card-header"></div><div id="card-text" class="card-text"></div><button id="card-ok" class="btn">OK</button></div>';
    document.body.appendChild(modal);
  }
  modal.classList.remove('hidden');
  document.getElementById('card-header').textContent=deckId[0].toUpperCase()+deckId.slice(1);
  document.getElementById('card-text').textContent=card.text||'—';
  const ok=document.getElementById('card-ok');
  ok.onclick=function(){
    // Hide modal, broadcast the effect. Engine stays untouched.
    modal.classList.add('hidden');
    const effect = (card && card.effect) ? String(card.effect) : '';
    document.dispatchEvent(new CustomEvent('card:ok', { detail: { effect } }));
  };
}

function hideCard(){ const m=document.getElementById('card-modal'); if(m) m.classList.add('hidden'); Cards.current=null; }

window.Cards=Cards; window.loadDecks=loadDecks; window.drawFrom=drawFrom; window.showCard=showCard; window.hideCard=hideCard;
