
(function(){
  'use strict';
  // --- utilities ---
  function basePath() {
    var a = document.createElement('a'); a.href = '.'; // resolves to current folder with trailing slash
    var path = a.pathname; return path.endsWith('/') ? path : (path + '/');
  }
  function withBase(p) {
    p = (p||'').replace(/^\//,'');
    return location.origin + basePath() + p;
  }

  // --- storage ---
  var Storage = {
    save: function(d){ try{ localStorage.setItem('legislate.v1.save', JSON.stringify(d)); }catch(e){} },
    load: function(){ try{ var raw=localStorage.getItem('legislate.v1.save'); return raw?JSON.parse(raw):null; }catch(e){ return null; } },
    clear: function(){ try{ localStorage.removeItem('legislate.v1.save'); }catch(e){} }
  };

  // --- RNG & dice ---
  function mulberry32(seed){ var t=seed>>>0; return function(){ t += 0x6D2B79F5; var r = Math.imul(t ^ (t>>>15), 1|t); r ^= r + Math.imul(r ^ (r>>>7), 61|r); return ((r ^ (r>>>14))>>>0) / 4294967296; }; }
  function makeDice(rng){ return function(){ return 1 + Math.floor(rng()*6); }; }

  // --- engine ---
  function createEngine(opts){
    var board = opts.board, decks = opts.decks, rng = opts.rng;
    var bus = (function(){ var m={}; return {
      on:function(t,f){ (m[t]||(m[t]=[])).push(f); },
      emit:function(t,p){ (m[t]||[]).forEach(function(fn){ fn(p); }); (m['*']||[]).forEach(function(fn){ fn(t,p); }); }
    }; })();
    var state = { packId: board.packId||'uk-parliament', players:[
      {id:'p1',name:'Player 1',color:'#d4351c',position:0},
      {id:'p2',name:'Player 2',color:'#1d70b8',position:0}
    ], turnIndex:0, decks:{} };
    var endIndex = (board.spaces.slice().reverse().find(function(s){return s.stage==='end';}) || board.spaces[board.spaces.length-1]).index;

    function shuffle(a){ var arr=a.slice(); for (var i=arr.length-1;i>0;i--){ var j = Math.floor(rng()*(i+1)); var tmp=arr[i]; arr[i]=arr[j]; arr[j]=tmp; } return arr; }
    Object.keys(decks).forEach(function(n){ state.decks[n] = shuffle(decks[n]); });

    function current(){ return state.players[state.turnIndex]; }
    function spaceFor(i){ for(var k=0;k<board.spaces.length;k++){ if(board.spaces[k].index===i) return board.spaces[k]; } return null; }
    function drawFrom(name){ var d=state.decks[name]; if(!d||!d.length) return null; return d.shift(); }

    function applyCard(card){
      if(!card) return;
      var applied = false;
      if (typeof card.effect === 'string' && card.effect.length) {
        var parts = card.effect.split(':'), type = parts[0], val = parts[1];
        if (type === 'move') { var n = Number(val||0); var p=current(); var i=p.position + n; if(i<0) i=0; if(i>endIndex) i=endIndex; p.position=i; applied=true; }
        else if (type === 'miss_turn') { current().skip = (current().skip||0)+1; applied=true; }
        else if (type === 'extra_roll') { current().extraRoll = true; applied=true; }
        else if (type === 'pingpong') { current().position = endIndex; applied=true; }
      }
      if (!applied) {
        var id = card.id||'';
        if (id==='Early04' || id==='Early09') { current().position = 0; }
        else if (id==='Implementation01') { current().position = endIndex; }
      }
    }

    function moveSteps(n){
      var p=current(); var step = n>=0?1:-1; var count = Math.abs(n);
      for (var k=0;k<count;k++){ p.position += step; if(p.position<0) p.position=0; if(p.position> endIndex) p.position=endIndex; bus.emit('MOVE_STEP',{playerId:p.id,to:p.position}); }
    }

    function takeTurn(roll){
      var p=current();
      if (p.skip && p.skip>0) { p.skip -= 1; bus.emit('TURN_SKIPPED',{playerId:p.id}); return endTurn(false); }
      bus.emit('DICE_ROLL',{playerId:p.id,roll:roll});
      moveSteps(roll);
      var landed = spaceFor(p.position);
      bus.emit('LANDED',{playerId:p.id,space:landed});
      if (p.position===endIndex){ bus.emit('GAME_END',{winners:[p]}); return; }
      if (landed && landed.deck && landed.deck!=='none'){ var card=drawFrom(landed.deck); bus.emit('CARD_DRAWN',{deck:landed.deck,card:card}); applyCard(card); }
      if (p.position===endIndex){ bus.emit('GAME_END',{winners:[p]}); return; }
      var extra = !!p.extraRoll; p.extraRoll=false; endTurn(extra);
    }

    function endTurn(extra){ if(!extra){ state.turnIndex = (state.turnIndex+1) % state.players.length; } bus.emit('TURN_BEGIN',{playerId:current().id,index:state.turnIndex}); }
    function setPlayers(c){ var defs=[
      {id:'p1',name:'Player 1',color:'#d4351c',position:0},{id:'p2',name:'Player 2',color:'#1d70b8',position:0},
      {id:'p3',name:'Player 3',color:'#00703c',position:0},{id:'p4',name:'Player 4',color:'#6f72af',position:0},
      {id:'p5',name:'Player 5',color:'#b58840',position:0},{id:'p6',name:'Player 6',color:'#912b88',position:0}
    ]; state.players = defs.slice(0, Math.min(6, Math.max(2,c))).map(function(p){ return Object.assign({}, p, {position:0, skip:0, extraRoll:false}); }); state.turnIndex=0; }
    function serialize(){ return { packId:state.packId, players:state.players, turnIndex:state.turnIndex, decks:state.decks }; }
    function hydrate(save){ if(!save) return; state.packId = save.packId||state.packId; state.players = save.players||state.players; state.turnIndex = (save.turnIndex!=null?save.turnIndex:state.turnIndex); state.decks = save.decks || state.decks; }
    function reset(){ state.players.forEach(function(p){ p.position=0; p.skip=0; p.extraRoll=false; }); state.turnIndex=0; Object.keys(decks).forEach(function(n){ state.decks[n]=shuffle(decks[n]); }); bus.emit('TURN_BEGIN',{playerId:current().id,index:state.turnIndex}); }

    return { bus:bus, state:state, endIndex:endIndex, setPlayers:setPlayers, takeTurn:takeTurn, serialize:serialize, hydrate:hydrate, reset:reset };
  }

  // --- UI helpers ---
  function setAlt(i,a){ i.setAttribute('alt', a||''); }
  function setSrc(i,s){ i.src = s; }
  function setTurnIndicator(el,name){ var txt = name + \"'s turn\"; el.textContent = txt.replace(/\s+'s/,\"'s\"); }
  function renderPlayers(container, players, activeId, opts){
    opts = opts || {}; var editable = !!opts.editable, onEdit = opts.onEdit||function(){}, locked = !!opts.locked;
    container.innerHTML='';
    players.forEach(function(p){
      var pill = document.createElement('div'); pill.className='player-pill';
      var dot = document.createElement('span'); dot.className='player-dot'; dot.style.background = p.color; pill.appendChild(dot);
      if (editable){
        var input = document.createElement('input'); input.type='text'; input.value=p.name; input.size = Math.max(8, Math.min(24, p.name.length));
        input.setAttribute('aria-label','Edit name for '+p.name); input.dataset.role='player-name'; if(locked) input.disabled=true;
        input.addEventListener('input', function(){ onEdit(p.id, input.value); input.size=Math.max(8,Math.min(24,(input.value||'').length||1)); });
        input.addEventListener('keydown', function(e){ if(e.key===' '||e.key==='Enter'){ e.stopPropagation(); } });
        pill.appendChild(input);
      } else {
        var t=document.createElement('span'); t.textContent=p.name; pill.appendChild(t);
      }
      container.appendChild(pill);
    });
  }
  function createModal(){
    function $(id){ return document.getElementById(id); }
    var root=$('modal-root'), title=$('modal-title'), body=$('modal-body'), ok=$('modal-ok'); var resolver=null;
    ok.addEventListener('click', function(){ close(); resolver && resolver(); });
    function open(opts){ title.textContent = (opts&&opts.title)||'Notice'; body.textContent = (opts&&opts.body)||''; root.style.display='block'; root.setAttribute('aria-hidden','false'); ok.focus(); return new Promise(function(res){ resolver=res; }); }
    function close(){ root.style.display='none'; root.setAttribute('aria-hidden','true'); resolver=null; }
    return { open:open, close:close };
  }
  function createBoardRenderer(opts){
    var imgEl=opts.imgEl, tokensLayer=opts.tokensLayer, board=opts.board;
    var Config={tokenBaseFactor:0.018, tokenMin:8, tokenMax:18, overlapRadiusFactor:1.2};
    function measure(){ var r=imgEl.getBoundingClientRect(); return {w:r.width,h:r.height}; }
    function tokenRadius(n){ var w=measure().w; var density=[1,1,1,0.95,0.9,0.85,0.8][n]||0.8; var r=Math.round(w*Config.tokenBaseFactor*density); r=Math.max(Config.tokenMin, Math.min(Config.tokenMax, r)); return r; }
    function placeTokens(players){
      var m=measure(), w=m.w, h=m.h; var r=tokenRadius(players.length);
      tokensLayer.innerHTML='';
      var map = {}; players.forEach(function(p){ (map[p.position]||(map[p.position]=[])).push(p); });
      Object.keys(map).forEach(function(idx){
        var space = board.spaces.find(function(s){return s.index===Number(idx)}); if(!space) return;
        var cx=(space.x/100)*w, cy=(space.y/100)*h; var group=map[idx]; var count=group.length;
        for (var i=0;i<count;i++){
          var p=group[i]; var angle=(Math.PI*2*i)/Math.max(1,count); var rad=r*Config.overlapRadiusFactor*(count>1?1:0);
          var x=cx+Math.cos(angle)*rad, y=cy+Math.sin(angle)*rad;
          var div=document.createElement('div'); div.className='token'; div.style.cssText='position:absolute;transform:translate(-50%,-50%);left:'+x+'px;top:'+y+'px;width:'+(r*2)+'px;height:'+(r*2)+'px;border-radius:50%;border:2px solid #0b0c0c;background:'+p.color;
          div.title=p.name+' @ '+idx; tokensLayer.appendChild(div);
        }
      });
    }
    window.addEventListener('resize', function(){ tokensLayer.innerHTML=''; });
    return { placeTokens:placeTokens, tokenRadius:tokenRadius };
  }

  // --- Loader (relative, no modules) ---
  function fetchJSON(rel){ return fetch(withBase(rel+'?cb='+(Date.now()))).then(function(r){ if(!r.ok) throw new Error('load '+rel); return r.json(); }); }

  // --- App bootstrap ---
  (function(){
    function $(id){ return document.getElementById(id); }
    var boardImg=$('board-img'), tokensLayer=$('tokens-layer'), modal=createModal();
    var turnIndicator=$('turn-indicator'), playersContainer=$('players'), rollBtn=$('roll-btn'), restartBtn=$('restart-btn'), footerAttrib=$('footer-attrib');

    Promise.resolve().then(function(){ return fetchJSON('content/registry.json'); }).then(function(registry){
      var id = (new URL(location.href)).searchParams.get('pack') || registry[0].id;
      var base = registry.find(function(p){return p.id===id;}).path;
      return Promise.all([
        fetchJSON(base+'/meta.json'),
        fetchJSON(base+'/board.json'),
        fetchJSON(base+'/cards/commons.json'),
        fetchJSON(base+'/cards/early.json'),
        fetchJSON(base+'/cards/implementation.json'),
        fetchJSON(base+'/cards/lords.json'),
        fetchJSON(base+'/cards/pingpong.json')
      ]).then(function(r){ return { meta:r[0], board:r[1], decks:{ commons:r[2], early:r[3], implementation:r[4], lords:r[5], pingpong:r[6] } }; });
    }).then(function(payload){
      var meta=payload.meta, board=payload.board, decks=payload.decks;
      setAlt(boardImg, meta.alt); setSrc(boardImg, withBase(meta.boardImage));
      footerAttrib.textContent = meta.attribution || 'Contains public sector information licensed under the Open Government Licence v3.0.';

      var seed = Math.floor(Math.random()*Math.pow(2,31)); var rng = mulberry32(seed); var dice = makeDice(rng);
      var engine = createEngine({ board:board, decks:decks, rng:rng });
      var boardUI = createBoardRenderer({ imgEl: boardImg, tokensLayer: tokensLayer, board: board });

      var namesLocked=false;
      var saved = Storage.load(); if(saved && saved.packId===engine.state.packId){ if(confirm('Resume your previous game?')) engine.hydrate(saved); else Storage.clear(); }

      function onEditName(id,value){ var p=engine.state.players.find(function(pp){return pp.id===id}); if(p){ p.name=value; Storage.save(engine.serialize()); updateUI(); } }
      function updateUI(){ var active=engine.state.players[engine.state.turnIndex]; renderPlayers(playersContainer, engine.state.players, active.id, { editable:true, onEdit:onEditName, locked:namesLocked }); setTurnIndicator(turnIndicator, active.name); boardUI.placeTokens(engine.state.players); }

      engine.bus.on('TURN_BEGIN', updateUI);
      engine.bus.on('MOVE_STEP', updateUI);
      engine.bus.on('CARD_DRAWN', function(evt){ if(!evt.card) return; modal.open({ title:'Card: '+evt.deck, body: evt.card.text||'' }).then(updateUI); });
      engine.bus.on('TURN_SKIPPED', function(){ modal.open({ title:'Turn skipped', body:'You miss a turn.' }); });
      engine.bus.on('GAME_END', function(evt){ var names = evt.winners.map(function(w){return w.name}).join(', '); modal.open({ title:'We have a winner!', body:names+' reached the end. Play again?' }).then(function(){ namesLocked=false; engine.reset(); Storage.save(engine.serialize()); updateUI(); }); });

      rollBtn.addEventListener('click', function(){ var ae=document.activeElement; if(ae && ae.tagName==='INPUT' && ae.dataset.role==='player-name') return;
        var r=dice(); namesLocked=true; modal.open({ title:'Dice roll', body:'You rolled a '+r+'.' }).then(function(){ engine.takeTurn(r); Storage.save(engine.serialize()); updateUI(); });
      });
      rollBtn.addEventListener('keydown', function(e){ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); rollBtn.click(); } });

      restartBtn.addEventListener('click', function(){ if(confirm('Do you really want to scrap all these bills and start again?')){ namesLocked=false; engine.reset(); Storage.save(engine.serialize()); updateUI(); } });

      engine.bus.emit('TURN_BEGIN', {}); updateUI();
    }).catch(function(err){
      console.error(err);
      var main=document.getElementById('main')||document.body;
      var div=document.createElement('div'); div.style.padding='1rem'; div.style.background='#f3f2f1'; div.style.border='2px solid #d4351c';
      div.innerHTML='<h2>There\\'s a problem loading the game</h2><p>Please check the content pack files and try again.</p>';
      main.prepend(div);
    });
  })();
})();