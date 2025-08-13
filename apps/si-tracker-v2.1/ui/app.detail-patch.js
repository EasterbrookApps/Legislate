// app.js detail timeline patch (drop-in)
(function(){
  const APP_SEGMENT = '/apps/si-tracker-v2.1';
  const BASE = location.pathname.includes(APP_SEGMENT)
    ? location.pathname.slice(0, location.pathname.indexOf(APP_SEGMENT) + APP_SEGMENT.length)
    : location.pathname.replace(/\/index\.html$/, '').replace(/\/$/, '');

  window.state = window.state || { data:{instruments:[],events:[]}, filters:{current:false,commons:false,status:new Set(),procedure:new Set(),dept:new Set()}, density: localStorage.getItem('density')||'comfy', theme: localStorage.getItem('theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light') };
  document.documentElement.dataset.theme = window.state.theme;
  document.body.classList.toggle('compact', window.state.density==='compact');

  const elView = document.getElementById('view');
  const tabs = [...document.querySelectorAll('.tab')];

  function setActiveTab(name){ tabs.forEach(t=> t.classList.toggle('active', t.dataset.tab===name)); }
  function fmtDate(d){ if(!d) return '—'; const o = new Date(d); return o.toLocaleDateString(undefined, {year:'numeric', month:'short', day:'numeric'}); }
  function badge(text, cls=''){ return `<span class="badge ${cls}">${text}</span>`; }

  async function loadData(){
    try{
      const p = BASE + '/data/instruments.json';
      const p2 = BASE + '/data/affirmative-events.json';
      const [a,b] = await Promise.all([fetch(p), fetch(p2)]);
      if(!a.ok) console.error('Fetch failed', p, a.status);
      if(!b.ok) console.error('Fetch failed', p2, b.status);
      window.state.data.instruments = a.ok ? await a.json() : [];
      window.state.data.events = b.ok ? await b.json() : [];
      console.log('Loaded instruments:', window.state.data.instruments.length, 'events:', window.state.data.events.length, 'BASE:', BASE);
    }catch(e){ console.error('Data load error', e); window.state.data={instruments:[],events:[]}; }
  }

  function renderDetail(id){
    const si = window.state.data.instruments.find(x=> x.id===decodeURIComponent(id));
    if(!si){ elView.innerHTML = `<p>Not found.</p>`; return; }
    const em = si.emHtml ? si.emHtml : '<p><em>Explanatory Memorandum not available.</em></p>';
    const timelineHTML = (si.timeline||[]).map(s=> `<div>• ${fmtDate(s.date)} — ${s.stepLabel||'Procedure step'} ${s.house?`(${s.house})`:''}</div>`).join('') || '<div>No timeline available.</div>';
    const cif = (si.comesIntoForce||[])[0] ? fmtDate(si.comesIntoForce[0]) : '—';
    const procText = [si.procedure?.kind, si.procedure?.scrutiny?`(${si.procedure.scrutiny})`:null].filter(Boolean).join(' ');

    elView.innerHTML = `<div class="detail">
      <section class="section">
        <h2 class="title">${si.title||'Untitled SI'}</h2>
        <div class="meta">
          <span>Laid: ${fmtDate(si.laidDate)}</span>
          <span>Procedure: ${procText||'—'}</span>
          <span>Dept: ${si.department||'—'}</span>
        </div>
        <div class="badges">
          ${(si.attentionScore?badge('Attention '+si.attentionScore,'attn'):'')}
          ${si.committees?.SLSC?.flagged?badge('SLSC','slsc'):''}
          ${si.committees?.JCSI?.flagged?badge('JCSI','jcsi'):''}
          ${si.breaks21DayRule===true?badge('21-day breach','breach'):''}
        </div>
      </section>
      <section class="section"><h3>Timeline</h3><div class="timeline">${timelineHTML}</div></section>
      <section class="section"><h3>Comes into force</h3><div>${cif}</div></section>
      <section class="section"><h3>Explanatory Memorandum</h3><div class="em">${em}</div></section>
      <section class="section"><h3>Links</h3>
        <div><a href="${si.links?.legislation||'#'}" target="_blank" rel="noopener">legislation.gov.uk</a></div>
        ${si.links?.memorandum? `<div><a href="${si.links.memorandum}" target="_blank" rel="noopener">Explanatory Memorandum</a></div>`:''}
      </section>
    </div>`;
  }

  // Minimal router reused from existing
  async function render(route){
    const page = route.split('/')[0] || 'laid';
    tabs.forEach(t=> t.classList.toggle('active', t.dataset.tab===page));
    if(page==='detail'){ renderDetail(route.split('/')[1]); return; }
    // For brevity, use existing laid/calendar code already in your repo
    // This patch focuses on the detail page corrections
    location.hash = '#/laid';
  }

  async function boot(){
    await loadData();
    const onHash = ()=>{ const r = (location.hash || '#/laid').slice(2); render(r); };
    window.addEventListener('hashchange', onHash); onHash();
  }
  document.addEventListener('DOMContentLoaded', boot);
})();