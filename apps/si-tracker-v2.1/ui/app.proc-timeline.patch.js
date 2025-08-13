// app.proc-timeline.patch.js — enhances card & detail rendering to use labels and timeline
(function(){
  function fmtDate(d){ if(!d) return '—'; const o = new Date(d); return o.toLocaleDateString(undefined, {year:'numeric', month:'short', day:'numeric'}); }

  // Patch renderDetail if present
  const wait = () => typeof window !== 'undefined' && typeof window.state !== 'undefined';
  const init = () => {
    const oldRenderDetail = window.renderDetail;
    window.renderDetail = function(id){
      const si = window.state.data.instruments.find(x=> x.id===decodeURIComponent(id));
      const elView = document.getElementById('view');
      if(!si){ elView.innerHTML = `<p>Not found.</p>`; return; }
      const proc = `${si.procedure?.kindLabel||'—'}${si.procedure?.scrutinyLabel?` (${si.procedure.scrutinyLabel})`:''}`;
      const em = si.emHtml ? si.emHtml : '<p><em>Explanatory Memorandum not available.</em></p>';
      const timeline = (si.timeline||[]).map(e=> `<div>• ${fmtDate(e.date)} — ${e.stepLabel||'Step'} ${e.house?`(${e.house})`:''}</div>`).join('') || '<div>No timeline recorded.</div>';
      elView.innerHTML = `<div class="detail">
        <section class="section">
          <h2 class="title">${si.title||'Untitled SI'}</h2>
          <div class="meta"><span>Laid: ${fmtDate(si.laidDate)}</span> <span>Dept: ${si.department||'—'}</span> <span>Procedure: ${proc}</span></div>
          <div class="badges">
            ${si.attentionScore?`<span class="badge attn">Attention ${si.attentionScore}</span>`:''}
            ${si.committees?.SLSC?.flagged?'<span class="badge slsc">SLSC</span>':''}
            ${si.committees?.JCSI?.flagged?'<span class="badge jcsi">JCSI</span>':''}
            ${si.breaks21DayRule===true?'<span class="badge breach">21‑day breach</span>':''}
          </div>
        </section>
        <section class="section"><h3>Timeline</h3><div class="timeline">${timeline}</div></section>
        <section class="section"><h3>Explanatory Memorandum</h3><div class="em">${em}</div></section>
        <section class="section"><h3>Links</h3>
          <div><a href="${si.links?.legislation||'#'}" target="_blank" rel="noopener">legislation.gov.uk</a></div>
          ${si.links?.memorandum? `<div><a href="${si.links.memorandum}" target="_blank" rel="noopener">Explanatory Memorandum</a></div>`:''}
        </section>
      </div>`;
    };

    // Patch card rendering by monkey-patching renderLaid to use labels
    const oldRenderLaid = window.renderLaid;
    if(oldRenderLaid){
      window.renderLaid = function(){
        const elView = document.getElementById('view');
        const fmt = fmtDate;
        const list = (window.applyFilters? window.applyFilters(window.state.data.instruments): window.state.data.instruments);
        elView.innerHTML = `<div class="searchbar">
           <input id="q" placeholder="Search titles…" aria-label="Search SIs">
           <button id="exportCsv">Export CSV</button>
          </div>
          <div class="grid">${
            list.map(si=>{
              const proc = `${si.procedure?.kindLabel||'—'}${si.procedure?.scrutinyLabel?` (${si.procedure.scrutinyLabel})`:''}`;
              const badges = [
                si.attentionScore?`<span class="badge attn">Attention ${si.attentionScore}</span>`:'',
                si.committees?.SLSC?.flagged?'<span class="badge slsc">SLSC</span>':'',
                si.committees?.JCSI?.flagged?'<span class="badge jcsi">JCSI</span>':'',
                si.breaks21DayRule===true?'<span class="badge breach">21‑day breach</span>':'',
                (si.status && si.status!=='current')?`<span class="badge">${si.status}</span>`:'',
                si.commonsOnly?'<span class="badge">Commons only</span>':''
              ].filter(Boolean).join(' ');
              return `<article class="card">
                <a href="#/detail/${encodeURIComponent(si.id)}" class="title">${si.title||'Untitled SI'}</a>
                <div class="meta"><span>Laid: ${fmt(si.laidDate)}</span><span>Procedure: ${proc}</span><span>${si.department||''}</span></div>
                <div class="badges">${badges}</div>
              </article>`;
            }).join('')
          }</div>
          <div class="footer">Items: ${list.length}</div>`;
        document.getElementById('q').addEventListener('input', ev=>{
          const term = ev.target.value.toLowerCase();
          const filtered = (window.applyFilters? window.applyFilters(window.state.data.instruments): window.state.data.instruments)
            .filter(si=> (si.title||'').toLowerCase().includes(term));
          const grid = elView.querySelector('.grid');
          grid.innerHTML = filtered.map(si=>{
            const proc = `${si.procedure?.kindLabel||'—'}${si.procedure?.scrutinyLabel?` (${si.procedure.scrutinyLabel})`:''}`;
            const badges = [
              si.attentionScore?`<span class="badge attn">Attention ${si.attentionScore}</span>`:'',
              si.committees?.SLSC?.flagged?'<span class="badge slsc">SLSC</span>':'',
              si.committees?.JCSI?.flagged?'<span class="badge jcsi">JCSI</span>':'',
              si.breaks21DayRule===true?'<span class="badge breach">21‑day breach</span>':'',
              (si.status && si.status!=='current')?`<span class="badge">${si.status}</span>`:'',
              si.commonsOnly?'<span class="badge">Commons only</span>':''
            ].filter(Boolean).join(' ');
            return `<article class="card">
              <a href="#/detail/${encodeURIComponent(si.id)}" class="title">${si.title||'Untitled SI'}</a>
              <div class="meta"><span>Laid: ${fmt(si.laidDate)}</span><span>Procedure: ${proc}</span><span>${si.department||''}</span></div>
              <div class="badges">${badges}</div>
            </article>`;
          }).join('');
          elView.querySelector('.footer').textContent = `Items: ${filtered.length}`;
        });
        document.getElementById('exportCsv').addEventListener('click', ()=> window.exportCsv && window.exportCsv(list));
      };
    }
  };
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', ()=> { if(wait()) init(); else setTimeout(init, 50); });
  }else { if(wait()) init(); else setTimeout(init, 50); }
})();
