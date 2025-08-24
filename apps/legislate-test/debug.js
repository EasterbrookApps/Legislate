
(function(){
  const FLAG = (new URL(location.href)).searchParams.get('debug') === '1' || localStorage.getItem('legislate.debug') === '1';
  const lsKey = 'legislate.debug';
  function setFlag(on){ try{ localStorage.setItem(lsKey, on?'1':'0'); }catch(e){} }
  if (!FLAG){ window.LegislateDebug = { enabled:false }; return; }
  const logs = []; const startTime = Date.now(); function now(){ return Date.now() - startTime; }
  function addLog(type, msg, extra){ logs.push({ t: now(), type, msg, extra }); renderRow({ t: now(), type, msg, extra }); }
  const root = document.createElement('div');
  root.innerHTML = `
  <style>
  .dbg-btn{position:fixed;right:.75rem;bottom:.75rem;z-index:9999;background:#0b0c0c;color:#fff;padding:.4rem .6rem;border-radius:.4rem;font:600 12px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial;box-shadow:0 2px 8px rgba(0,0,0,.3)}
  .dbg-wrap{position:fixed;right:.5rem;bottom:2.6rem;width:min(92vw,520px);max-height:70vh;background:#fff;border:1px solid #b1b4b6;border-radius:.5rem;box-shadow:0 6px 20px rgba(0,0,0,.25);display:none;flex-direction:column;z-index:9999}
  .dbg-wrap.open{display:flex}
  .dbg-h{display:flex;align-items:center;justify-content:space-between;padding:.4rem .6rem;background:#f3f2f1;border-bottom:1px solid #b1b4b6}
  .dbg-tabs{display:flex;gap:.25rem}
  .dbg-tab{padding:.25rem .5rem;border:1px solid #b1b4b6;background:#fff;border-radius:.35rem;cursor:pointer;font-size:12px}
  .dbg-tab.active{background:#1d70b8;color:#fff;border-color:#1d70b8}
  .dbg-body{padding:.5rem;overflow:auto;font:12px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace}
  .dbg-row{border-bottom:1px dashed #eee;padding:.2rem 0}
  .dbg-meta{color:#505a5f}
  .dbg-actions{display:flex;gap:.25rem}
  .dbg-actions button{border:1px solid #b1b4b6;background:#fff;border-radius:.35rem;padding:.25rem .5rem;font-size:12px;cursor:pointer}
  .dbg-badge{display:inline-block;padding:.1rem .3rem;border-radius:.35rem;font-weight:600}
  .dbg-OK{background:#00703c;color:#fff}
  .dbg-ERR{background:#d4351c;color:#fff}
  </style>
  <button class="dbg-btn" aria-expanded="false">DEBUG</button>
  <div class="dbg-wrap" role="dialog" aria-label="Debug panel" aria-modal="false">
    <div class="dbg-h">
      <div class="dbg-tabs">
        <button class="dbg-tab active" data-tab="log">Logs</button>
        <button class="dbg-tab" data-tab="net">Network</button>
        <button class="dbg-tab" data-tab="state">State</button>
      </div>
      <div class="dbg-actions">
        <button data-act="download">Download</button>
        <button data-act="clear">Clear</button>
        <button data-act="reset">Reset Save</button>
        <button data-act="off">Turn Off</button>
      </div>
    </div>
    <div class="dbg-body" data-pane="log"></div>
    <div class="dbg-body" data-pane="net" style="display:none"></div>
    <div class="dbg-body" data-pane="state" style="display:none"></div>
  </div>`;
  document.addEventListener('DOMContentLoaded', ()=> document.body.appendChild(root), { once:true });
  const waitBody = setInterval(()=>{ if (document.body){ clearInterval(waitBody); document.body.appendChild(root); } }, 10);
  const btn = () => root.querySelector('.dbg-btn');
  const wrap = () => root.querySelector('.dbg-wrap');
  const panes = {
    log: () => root.querySelector('[data-pane="log"]'),
    net: () => root.querySelector('[data-pane="net"]'),
    state: () => root.querySelector('[data-pane="state"]')
  };
  function setOpen(on){ wrap().classList.toggle('open', on); btn().setAttribute('aria-expanded', String(on)); if(on) refreshState(); }
  root.addEventListener('click', (e)=>{
    const t = e.target;
    if (t.classList.contains('dbg-btn')){ setOpen(!wrap().classList.contains('open')); }
    if (t.classList.contains('dbg-tab')){ root.querySelectorAll('.dbg-tab').forEach(b=> b.classList.remove('active')); t.classList.add('active'); const key=t.getAttribute('data-tab'); Object.keys(panes).forEach(k=> panes[k]().style.display = (k===key)?'block':'none'); if (key==='state') refreshState(); }
    if (t.dataset.act==='download'){ const blob=new Blob([JSON.stringify({ when:new Date().toISOString(), url:location.href, logs }, null, 2)], {type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='legislate-debug-log.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),500); }
    if (t.dataset.act==='clear'){ logs.length=0; panes.log().innerHTML=''; panes.net().innerHTML=''; addLog('info','[cleared]'); }
    if (t.dataset.act==='reset'){ try{ localStorage.removeItem('legislate.v1.save'); addLog('info','[save cleared]'); }catch(e){} }
    if (t.dataset.act==='off'){ setFlag(false); location.reload(); }
  });
  function renderRow(entry){ const line=document.createElement('div'); line.className='dbg-row'; const msg=typeof entry.msg==='string'?entry.msg:JSON.stringify(entry.msg); line.innerHTML=`<span class="dbg-meta">[${entry.t}ms] ${entry.type}</span> ${msg}`; panes.log().prepend(line); }
  ['log','warn','error'].forEach(k=>{ const orig=console[k].bind(console); console[k]=function(...args){ try{ addLog(k, args.map(a => (typeof a==='string'?a:JSON.stringify(a))).join(' ')); }catch(e){}; orig(...args); }; });
  window.addEventListener('error', (e)=> addLog('error', (e.message||'error'), {src:e.filename, line:e.lineno} ));
  window.addEventListener('unhandledrejection', (e)=> addLog('error', 'unhandledrejection', {reason: (e.reason && (e.reason.stack || e.reason.message || String(e.reason))) }));
  const origFetch = window.fetch.bind(window);
  window.fetch = async function(input, init){ const url=(typeof input==='string')?input:(input&&input.url)||''; const t0=performance.now(); try{ const res=await origFetch(input, init); const dt=Math.round(performance.now()-t0); const ok=res.ok?'OK':'ERR'; const row=document.createElement('div'); row.className='dbg-row'; row.innerHTML=`<span class="dbg-badge dbg-${ok}">${ok}</span> <code>${url.replace(location.origin,'')}</code> <span class="dbg-meta">${res.status} • ${dt}ms</span>`; panes.net().prepend(row); if(!res.ok){ addLog('error', `FETCH ${ok} ${url}`, {status:res.status}); } return res; } catch(err){ const dt=Math.round(performance.now()-t0); const row=document.createElement('div'); row.className='dbg-row'; row.innerHTML=`<span class="dbg-badge dbg-ERR">ERR</span> <code>${url.replace(location.origin,'')}</code> <span class="dbg-meta">thrown • ${dt}ms</span>`; panes.net().prepend(row); addLog('error', `FETCH ERR ${url}`, {err:String(err)}); throw err; } };
  function refreshState(){ try{ const s=window.engine&&window.engine.state; if(!s){ panes.state().innerHTML='<div class="dbg-row">engine not initialised</div>'; return; } const players=s.players.map(p=>`${p.name} <small>(pos ${p.position})</small>`).join('<br/>');
    panes.state().innerHTML = `<div class="dbg-row"><b>Turn:</b> ${s.turnIndex+1}/${s.players.length}</div><div class="dbg-row"><b>Players:</b><br/>${players}</div>`; }catch(e){} }
  addLog('info','[debug enabled] '+location.href); setOpen(true);
  window.LegislateDebug = { enabled:true, logs, refreshState };
})(); 
