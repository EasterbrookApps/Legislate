// app.detail-patch.js: use human-readable procedure labels and show timeline
(function(){
  const orgRenderDetail = window.renderDetail;
  window.renderDetail = function(id){
    const si = window.state?.data?.instruments?.find(x=> x.id===decodeURIComponent(id));
    const view = document.getElementById('view');
    if(!si){ view.innerHTML = '<p>Not found.</p>'; return; }
    const kind = si.procedure?.kind || '—';
    const scrutiny = si.procedure?.scrutiny ? ` (${si.procedure.scrutiny})` : '';
    const em = si.emHtml ? si.emHtml : '<p><em>Explanatory Memorandum not available.</em></p>';
    const timeline = Array.isArray(si.timeline) && si.timeline.length
      ? si.timeline.map(e=> `<div>• ${e.date? new Date(e.date).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}):'—'} — ${e.stepLabel||'Step'} ${e.house?`(${e.house})`:''}</div>`).join('')
      : '<div>No procedure steps recorded.</div>';
    view.innerHTML = `<div class="detail">
      <section class="section">
        <h2 class="title">${si.title||'Untitled SI'}</h2>
        <div class="meta"><span>Laid: ${si.laidDate? new Date(si.laidDate).toLocaleDateString(): '—'}</span> <span>Dept: ${si.department||'—'}</span> <span>Procedure: ${kind}${scrutiny}</span></div>
        <div class="badges">${(si.attentionScore?'<span class="badge attn">Attention '+si.attentionScore+'</span>':'')}${si.committees?.SLSC?.flagged?'<span class="badge slsc">SLSC</span>':''}${si.committees?.JCSI?.flagged?'<span class="badge jcsi">JCSI</span>':''}${si.breaks21DayRule===true?'<span class="badge breach">21-day breach</span>':''}</div>
      </section>
      <section class="section"><h3>Timeline</h3><div class="timeline">${timeline}</div></section>
      <section class="section"><h3>Explanatory Memorandum</h3><div class="em">${em}</div></section>
      <section class="section"><h3>Links</h3>
        <div><a href="${si.links?.legislation||'#'}" target="_blank" rel="noopener">legislation.gov.uk</a></div>
        ${si.links?.memorandum? `<div><a href="${si.links.memorandum}" target="_blank" rel="noopener">Explanatory Memorandum</a></div>`:''}
      </section>
    </div>`;
  };
})();