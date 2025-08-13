// SPA + list/detail + filters
const BASE = location.pathname.replace(/\/index\.html$/, '').replace(/\/$/, '');
window.state = {
  data: { instruments: [], events: [] },
  filters: { current: false, commons: false, status: new Set(), procedure: new Set(), dept: new Set() },
  density: localStorage.getItem('density') || 'comfy',
  theme: localStorage.getItem('theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
};
document.documentElement.dataset.theme = window.state.theme;
document.body.classList.toggle('compact', window.state.density==='compact');

const elView = document.getElementById('view');
const tabs = [...document.querySelectorAll('.tab')];

function setActiveTab(name){ tabs.forEach(t=> t.classList.toggle('active', t.dataset.tab===name)); }

async function loadData(){
  const p = BASE + '/data/instruments.json';
  const p2 = BASE + '/data/affirmative-events.json';
  const [a,b] = await Promise.all([fetch(p).then(r=>r.ok?r.json():[]), fetch(p2).then(r=>r.ok?r.json():[])]);
  window.state.data.instruments = Array.isArray(a)? a : [];
  window.state.data.events = Array.isArray(b)? b : [];
}

function fmtDate(d){ if(!d) return '—'; const o = new Date(d); return o.toLocaleDateString(undefined, {year:'numeric', month:'short', day:'numeric'}); }

function badge(text, cls=''){ return `<span class="badge ${cls}">${text}</span>`; }

function card(si){
  const badges = [];
  if(si.attentionScore>0) badges.push(badge(`Attention ${si.attentionScore}`, 'attn'));
  if(si.committees?.SLSC?.flagged) badges.push(badge('SLSC', 'slsc'));
  if(si.committees?.JCSI?.flagged) badges.push(badge('JCSI', 'jcsi'));
  if(si.breaks21DayRule===true) badges.push(badge('21-day breach', 'breach'));
  if(si.status && si.status!=='current') badges.push(badge(si.status));
  if(si.commonsOnly) badges.push(badge('Commons only'));
  return `<article class="card" role="article">
    <a href="#/detail/${encodeURIComponent(si.id)}" class="title">${si.title||'Untitled SI'}</a>
    <div class="meta">
      <span>Laid: ${fmtDate(si.laidDate)}</span>
      <span>Procedure: ${(si.procedure?.kind||'—')} ${(si.procedure?.scrutiny?`(${si.procedure.scrutiny})`:'')}</span>
      <span>${si.department||''}</span>
    </div>
    <div class="badges">${badges.join(' ')}</div>
  </article>`;
}

function applyFilters(list){
  return list.filter(si=>{
    if(window.state.filters.current && si.status!=='current') return false;
    if(window.state.filters.commons && !si.commonsOnly) return false;
    if(window.state.filters.status.size && !window.state.filters.status.has(si.status||'current')) return false;
    if(window.state.filters.procedure.size){
      const key = `${si.procedure?.kind||''}/${si.procedure?.scrutiny||''}`.toLowerCase();
      let ok=false; window.state.filters.procedure.forEach(v=>{ if(key.includes(v)) ok=true; });
      if(!ok) return false;
    }
    if(window.state.filters.dept.size && !window.state.filters.dept.has((si.department||'').toLowerCase())) return false;
    return true;
  });
}

function renderLaid(){
  const list = applyFilters(window.state.data.instruments);
  elView.innerHTML = `<div class="searchbar">
     <input id="q" placeholder="Search titles…" aria-label="Search SIs">
     <button id="exportCsv">Export CSV</button>
    </div>
    <div class="grid">${list.map(card).join('')}</div>
    <div class="footer">Items: ${list.length}</div>`;
  document.getElementById('q').addEventListener('input', ev=>{
    const term = ev.target.value.toLowerCase();
    const filtered = applyFilters(window.state.data.instruments).filter(si=> (si.title||'').toLowerCase().includes(term));
    document.querySelector('.grid').innerHTML = filtered.map(card).join('');
    document.querySelector('.footer').textContent = `Items: ${filtered.length}`;
  });
  document.getElementById('exportCsv').addEventListener('click', ()=> exportCsv(applyFilters(window.state.data.instruments)));
}

function renderDetail(id){
  const si = window.state.data.instruments.find(x=> x.id===decodeURIComponent(id));
  if(!si){ elView.innerHTML = `<p>Not found.</p>`; return; }
  const em = si.emHtml ? si.emHtml : '<p><em>Explanatory Memorandum not available.</em></p>';
  const timeline = (si.events||[]).map(e=> `<div>• ${fmtDate(e.date)} — ${e.label||''} ${e.house?`(${e.house})`:''}</div>`).join('') || '<div>No events recorded.</div>';
  const cif = (si.comesIntoForce||[])[0] ? fmtDate(si.comesIntoForce[0]) : '—';
  elView.innerHTML = `<div class="detail">
    <section class="section">
      <h2 class="title">${si.title||'Untitled SI'}</h2>
      <div class="meta"><span>Laid: ${fmtDate(si.laidDate)}</span> <span>Dept: ${si.department||'—'}</span> <span>Procedure: ${(si.procedure?.kind||'—')} ${(si.procedure?.scrutiny?`(${si.procedure.scrutiny})`:'')}</span></div>
      <div class="badges">${(si.attentionScore?badge('Attention '+si.attentionScore,'attn'):'')}${si.committees?.SLSC?.flagged?badge('SLSC','slsc'):''}${si.committees?.JCSI?.flagged?badge('JCSI','jcsi'):''}${si.breaks21DayRule===true?badge('21-day breach','breach'):''}</div>
    </section>
    <section class="section"><h3>Timeline</h3><div class="timeline">${timeline}</div></section>
    <section class="section"><h3>Comes into force</h3><div>${cif}</div></section>
    <section class="section"><h3>Explanatory Memorandum</h3><div class="em">${em}</div></section>
    <section class="section"><h3>Links</h3>
      <div><a href="${si.links?.legislation||'#'}" target="_blank" rel="noopener">legislation.gov.uk</a></div>
      ${si.links?.memorandum? `<div><a href="${si.links.memorandum}" target="_blank" rel="noopener">Explanatory Memorandum</a></div>`:''}
    </section>
  </div>`;
}

function renderArchive(){ elView.innerHTML = `<p>Archive is repo-backed. Edit <code>data/archive.json</code> to move items here.</p>`; }
function renderWatchlist(){ elView.innerHTML = `<p>Watchlist stores items you mark (to be implemented after data stabilises).</p>`; }
function renderAbout(){ elView.innerHTML = `<div class="detail">
  <section class="section">
    <h3>About this tracker</h3>
    <p>This site tracks UK Statutory Instruments laid since the last general election. It surfaces committee flags (SLSC/JCSI), 21‑day rule breaches for negatives, and approval motions for affirmatives.</p>
  </section>
  <section class="section">
    <h3>How SIs work</h3>
    <ul>
      <li><strong>Procedures:</strong> Affirmative (requires approval) vs Negative (becomes law unless annulled). Some drafts are signed into law.</li>
      <li><strong>21‑day rule:</strong> Made negatives should be laid 21 days before coming into force; the tracker highlights likely breaches.</li>
      <li><strong>Committees:</strong> SLSC draws special attention on policy/merits; JCSI reports on technical drafting/vires issues.</li>
      <li><strong>Currently before Parliament:</strong> Instruments without a completion state are shown as current.</li>
    </ul>
  </section>
</div>`; }

function exportCsv(list){
  const cols = ["id","title","laidDate","department","procedure.kind","procedure.scrutiny","status","commonsOnly","breaks21DayRule"];
  const esc = s => ('"'+String(s).replace(/"/g,'""')+'"');
  const row = o => cols.map(c=>{ const path=c.split('.'); let v=o; for(const p of path){ v = (v||{})[p]; } return esc(v==null?'':v); }).join(',');
  const csv = [cols.join(','), ...list.map(row)].join('\n');
  const blob = new Blob([csv], {type:'text/csv'}); const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'si-export.csv'; a.click();
}

function buildFilterChips(){
  const st = new Set(window.state.data.instruments.map(i=> i.status||'current'));
  const procs = new Set(window.state.data.instruments.map(i=> `${i.procedure?.kind||''}/${i.procedure?.scrutiny||''}`.toLowerCase()));
  const depts = new Set(window.state.data.instruments.map(i=> (i.department||'').toLowerCase()).filter(Boolean));
  const mk = (containerId, set)=>{
    const el = document.getElementById(containerId); el.innerHTML = '';
    Array.from(set).sort().forEach(v=>{
      const n = window.state.data.instruments.filter(i=>{
        if(containerId==='chips-status') return (i.status||'current')===v;
        if(containerId==='chips-procedure') return (`${i.procedure?.kind||''}/${i.procedure?.scrutiny||''}`.toLowerCase())===v;
        if(containerId==='chips-dept') return (i.department||'').toLowerCase()===v;
      }).length;
      const chip = document.createElement('button');
      chip.className='chip'; chip.textContent = `${v} (${n})`;
      chip.addEventListener('click', ()=>{
        const key = containerId==='chips-status'?'status': (containerId==='chips-procedure'?'procedure':'dept');
        const val = v; const setRef = window.state.filters[key];
        if(setRef.has(val)) setRef.delete(val); else setRef.add(val);
        chip.classList.toggle('active'); renderLaid();
      });
      el.appendChild(chip);
    });
  };
  mk('chips-status', st); mk('chips-procedure', procs); mk('chips-dept', depts);
}

function hookFilters(){
  document.getElementById('flt-current').onchange = (e)=> { window.state.filters.current = e.target.checked; renderLaid(); };
  document.getElementById('flt-commons').onchange = (e)=> { window.state.filters.commons = e.target.checked; renderLaid(); };
  document.getElementById('clearFilters').onclick = ()=> {
    window.state.filters = { current:false, commons:false, status:new Set(), procedure:new Set(), dept:new Set() };
    document.getElementById('flt-current').checked = false;
    document.getElementById('flt-commons').checked = false;
    buildFilterChips(); renderLaid();
  };
}

function initActions(){
  document.getElementById('themeBtn').onclick = ()=>{
    window.state.theme = (window.state.theme==='dark'?'light':'dark');
    document.documentElement.dataset.theme = window.state.theme;
    localStorage.setItem('theme', window.state.theme);
  };
  document.getElementById('densityBtn').onclick = ()=>{
    window.state.density = (window.state.density==='compact'?'comfy':'compact');
    document.body.classList.toggle('compact', window.state.density==='compact');
    localStorage.setItem('density', window.state.density);
  };
  document.getElementById('searchBtn').onclick = ()=>{
    const q = document.getElementById('q'); if(q){ q.focus(); q.select(); }
  };
}

async function render(route){
  tabs.forEach(t=> t.classList.remove('active'));
  const active = route.split('/')[0] || 'laid';
  tabs.forEach(t=> t.classList.toggle('active', t.dataset.tab===active));
  if(active==='laid'){ buildFilterChips(); hookFilters(); renderLaid(); }
  else if(active==='calendar'){ renderCalendar(); }
  else if(active==='archive'){ renderArchive(); }
  else if(active==='watchlist'){ renderWatchlist(); }
  else if(active==='about'){ renderAbout(); }
  if(active==='detail'){ renderDetail(route.split('/')[1]); }
}

async function boot(){
  await loadData(); initActions();
  const onHash = ()=>{ const r = (location.hash || '#/laid').slice(2); render(r); };
  window.addEventListener('hashchange', onHash); onHash();
}
boot();
