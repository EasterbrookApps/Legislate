
import { filtered, all, byId } from './data.js';

const cardsEl = document.getElementById('cards');
const archiveEl = document.getElementById('archive-cards');
const watchEl = document.getElementById('watch-cards');
const drawer = document.getElementById('drawer');
const drawerContent = document.getElementById('drawerContent');

// Simple virtualization
const PAGE = 40;

export function renderCards(open){
  const list = filtered();
  cardsEl.innerHTML = '';
  let page = 0;
  const sentinel = document.createElement('div');
  sentinel.id = 'sentinel';
  cardsEl.appendChild(sentinel);

  const io = new IntersectionObserver((entries)=>{
    if(entries[0].isIntersecting){
      const slice = list.slice(page*PAGE, (page+1)*PAGE);
      const frag = document.createElement('div');
      frag.innerHTML = slice.map(cardHTML).join('');
      cardsEl.insertBefore(frag, sentinel);
      wire(open);
      page++;
      if(page*PAGE >= list.length){ io.disconnect(); sentinel.remove(); }
    }
  });
  io.observe(sentinel);
}

export function renderArchiveCards(){
  const list = all.items.filter(i=> all.archive.includes(i.id));
  archiveEl.innerHTML = list.map(cardHTML).join('');
  wire(openDrawer);
}

export function renderWatchCards(open){
  const watch = new Set(JSON.parse(localStorage.getItem('si.watch')||'[]'));
  const list = all.items.filter(i=> watch.has(i.id));
  watchEl.innerHTML = list.map(cardHTML).join('');
  wire(open);
}

function wire(open){
  document.querySelectorAll('.open').forEach(btn=>{
    btn.addEventListener('click', ()=> open(btn.dataset.id));
  });
  document.querySelectorAll('.archive').forEach(btn=>{
    btn.addEventListener('click', ()=> exportArchive(btn.dataset.id));
  });
  document.querySelectorAll('.watch').forEach(btn=>{
    btn.addEventListener('click', ()=> toggleWatch(btn.dataset.id, btn));
  });
  document.querySelectorAll('.copylink').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const url = location.origin + location.pathname + '#id=' + encodeURIComponent(btn.dataset.id);
      navigator.clipboard.writeText(url).then(()=> alert('Link copied'));
    });
  });
}

function badge(proc){
  if(!proc) return '';
  const cls = proc.scrutiny === 'affirmative' ? 'affirmative' : (proc.scrutiny === 'negative' ? 'negative' : '');
  const text = `${proc.kind?.[0]?.toUpperCase() + proc.kind?.slice(1) || ''} ${proc.scrutiny || ''}`.trim();
  return `<span class="badge ${cls}" title="Procedure">${text}</span>`;
}

function committeeBadges(cmts){
  let out = '';
  if(cmts?.SLSC?.flagged) out += `<span class="badge flag" title="SLSC attention">SLSC attention</span>`;
  if(cmts?.JCSI?.flagged) out += `<span class="badge flag" title="JCSI report">JCSI report</span>`;
  return out;
}

function diffBadges(changed){
  if(!changed||!changed.length) return '';
  return changed.map(c=> `<span class="badge diff" title="Changed: ${c}">${c}</span>`).join('');
}

function cardHTML(i){
  const breach = i.breaks21DayRule ? `<span class="badge breach" title="21‑day rule breach">21‑day breach</span>` : '';
  const ok21 = (i.procedure?.scrutiny === 'negative' && i.breaks21DayRule === false) ? `<span class="badge ok" title="21‑day rule OK">21‑day OK</span>` : '';
  const score = `<span class="badge" title="Attention score: flags, breaches, near events">${i._score ?? ''}★</span>`;
  const changed = diffBadges(i.changed);
  return `
  <article class="card">
    <div class="title">${escapeHtml(i.title||'Untitled')}</div>
    <div class="meta">
      <span>Laid: ${fmt(i.laidDate)}</span>
      ${i.department ? `<span>Dept: ${escapeHtml(i.department)}</span>` : ''}
      ${i.sI ? `<span>SI: ${escapeHtml(i.sI)}</span>` : ''}
      ${badge(i.procedure)}
      ${committeeBadges(i.committees)}
      ${breach || ok21}
      ${score}
      ${changed}
    </div>
    <div class="actions">
      <button class="btn primary open" data-id="${i.id}">Open</button>
      <a class="btn" href="${i.links?.legislation||'#'}" target="_blank" rel="noopener">Legislation</a>
      ${ i.links?.memorandum ? `<a class="btn" href="${i.links.memorandum}" target="_blank" rel="noopener">EM</a>` : ''}
      <button class="btn copylink" data-id="${i.id}">Copy link</button>
      <button class="btn archive" data-id="${i.id}" title="Archive (download merged file)">Archive…</button>
      <button class="btn watch" data-id="${i.id}" title="Toggle watch">Watch</button>
    </div>
  </article>`;
}

function fmt(d){
  if(!d) return '—';
  try{
    const dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString(undefined, {year:'numeric', month:'short', day:'2-digit'});
  }catch(e){ return d; }
}

function escapeHtml(s){ return (s||'').replace(/[&<>"]/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' })[c]); }

export function openDrawer(id){
  const i = byId(id);
  const detail = detailHTML(i);
  drawerContent.innerHTML = detail;
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden','false');
  // focus trap
  setTimeout(()=> document.getElementById('closeDrawer')?.focus(), 0);
  // EM highlight support
  const emQ = document.getElementById('emQ');
  if(emQ){
    emQ.addEventListener('keydown', (e)=>{
      if(e.key==='Enter'){
        highlightEM((emQ.value||'').trim());
      }
    });
  }
}

function detailHTML(i){
  const events = (i.events||[]).map(ev=> `<li>${fmt(ev.date)} — ${ev.house||''} ${escapeHtml(ev.label||'')}</li>`).join('');
  const emBlock = i.emHtml
    ? `<h3>Explanatory Memorandum</h3><div class="search" style="margin:8px 0 12px"><input id="emQ" placeholder="Find in EM… (Enter)"></div><div id="emViewer">${i.emHtml}</div>`
    : (i.links?.memorandum ? `<p class="muted">EM available at source; inline render not captured yet.</p>` : '<p class="muted">No EM found.</p>');
  const verdict = verdict21(i);
  return `
    <h2>${escapeHtml(i.title||'Untitled')}</h2>
    <p class="meta">Laid: ${fmt(i.laidDate)} • ${i.department?escapeHtml(i.department):''} • ${i.sI?escapeHtml(i.sI):''}</p>
    <p>${i.procedure? `${i.procedure.kind||''} ${i.procedure.scrutiny||''}`:''}</p>
    ${verdict}
    <h3>Timeline</h3>
    <ul>${events||'<li>—</li>'}</ul>
    ${emBlock}
  `;
}

function verdict21(i){
  if(i.procedure?.scrutiny !== 'negative' || i.procedure?.kind !== 'made') return '';
  if(i.breaks21DayRule === null) return `<p class="muted">21‑day rule: <em>uncertain</em> (insufficient data).</p>`;
  const earliest = (i.comesIntoForce?.[0]) || null;
  if(i.breaks21DayRule === true) return `<p><span class="badge breach">21‑day breach</span> Earliest CIF: ${fmt(earliest)}. Laid: ${fmt(i.laidDate)}.</p>`;
  return `<p><span class="badge ok">21‑day OK</span> Earliest CIF: ${fmt(earliest)}. Laid: ${fmt(i.laidDate)}.</p>`;
}

function highlightEM(term){
  const v = document.getElementById('emViewer');
  if(!v || !term) return;
  // very simple highlighter
  const rx = new RegExp('('+term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','gi');
  v.innerHTML = v.innerHTML.replace(/<mark class="highlight">|<\/mark>/g,''); // clear
  v.innerHTML = v.innerHTML.replace(rx, '<mark class="highlight">$1</mark>');
}

function exportArchive(id){
  const existing = (window.__archiveIds || []);
  const merged = Array.from(new Set([...existing, id]));
  const blob = new Blob([JSON.stringify({ids: merged}, null, 2)], {type:'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'archive.json'; a.click();
}

function toggleWatch(id, btn){
  const key = 'si.watch';
  const arr = JSON.parse(localStorage.getItem(key)||'[]');
  const set = new Set(arr);
  if(set.has(id)) set.delete(id); else set.add(id);
  localStorage.setItem(key, JSON.stringify(Array.from(set)));
  btn.textContent = set.has(id)?'Unwatch':'Watch';
}
