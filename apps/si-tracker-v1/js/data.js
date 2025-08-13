
let basePath = './';
export function setBasePath(b){ basePath = b; }

export let all = { items: [], events: [], archive: [], emIndex: null, build: null };
export let filters = { term: '', tags: new Set() };
const LS = {
  watch: 'si.watch',
  saved: 'si.saved',
};

export async function loadData(){
  const [items, events, archive, emIndex, build] = await Promise.all([
    fetch(basePath + 'data/instruments.json').then(r=>r.json()).catch(()=>fetch('./data/sample.instruments.json').then(r=>r.json())),
    fetch(basePath + 'data/affirmative-events.json').then(r=>r.json()).catch(()=>fetch('./data/sample.events.json').then(r=>r.json())),
    fetch(basePath + 'data/archive.json').then(r=>r.json()).catch(()=>({ids:[]})),
    fetch(basePath + 'data/lunr-index.json').then(r=>r.json()).catch(()=>null),
    fetch(basePath + 'data/build.json').then(r=>r.json()).catch(()=>null),
  ]);
  all.items = items;
  all.events = events;
  all.archive = archive.ids || [];
  all.emIndex = emIndex;
  all.build = build;
  window.__buildInfo = build;
  // Precompute searchable fields
  all.items.forEach(i=>{
    i._t = (i.title || '').toLowerCase();
    i._d = (i.department || '').toLowerCase();
    i._score = (i.attentionScore ?? score(i));
  });
  // Sort by attention then laid desc
  all.items.sort((a,b)=> (b._score - a._score) || (b.laidDate||'').localeCompare(a.laidDate||''));
}

function score(i){
  // Transparent formula: flags + breaches + near events
  let s = 0;
  if(i.committees?.SLSC?.flagged) s += 3;
  if(i.committees?.JCSI?.flagged) s += 3;
  if(i.breaks21DayRule === true) s += 4;
  const next = i.events?.find(e=> e.date >= today());
  if(next) s += 2;
  return s;
}

function today(){ return new Date().toISOString().slice(0,10); }

export function searchAll(term){
  filters.term = (term||'').toLowerCase();
}
export function toggleFilter(f, on){
  if(on) filters.tags.add(f); else filters.tags.delete(f);
}
export function applyQueryFromURL(){
  const p = new URLSearchParams(location.search);
  const q = p.get('q'); const tags = p.get('tags');
  if(q){ filters.term = q.toLowerCase(); const el = document.getElementById('q'); if(el) el.value = q; }
  if(tags){ tags.split(',').forEach(t=> filters.tags.add(t)); document.querySelectorAll('[data-filter]').forEach(ch=>{
    if(filters.tags.has(ch.dataset.filter)) ch.setAttribute('data-on','true');
  });}
}

export function filtered(){
  let list = all.items.filter(i=> !all.archive.includes(i.id));
  const t = filters.term;
  // Watchlist filter
  const watch = JSON.parse(localStorage.getItem(LS.watch)||'[]');
  const watchSet = new Set(watch);
  if(filters.tags.has('watch:yes')) list = list.filter(i=> watchSet.has(i.id));

  if(t){
    list = list.filter(i=> i._t.includes(t) || i._d.includes(t) || emHit(i, t));
  }
  for(const tag of filters.tags){
    const [key, val] = tag.split(':');
    if(key === 'procedure'){
      list = list.filter(i=> (i.procedure?.scrutiny||'').includes(val));
    }else if(key === 'flag' && val === 'committee'){
      list = list.filter(i=> (i.committees?.SLSC?.flagged || i.committees?.JCSI?.flagged));
    }else if(key === 'breach' && val === 'yes'){
      list = list.filter(i=> i.breaks21DayRule === true);
    }else if(key === 'year' && val === 'current'){
      const y = new Date().getFullYear().toString();
      list = list.filter(i=> (i.laidDate||'').startsWith(y));
    }
  }
  return list;
}

function emHit(item, t){
  if(!all.emIndex) return false;
  try{
    const hits = window.lunrIndex.search(t);
    return hits.some(h=> h.ref === item.id);
  }catch(e){ return false; }
}

export function byId(id){ return all.items.find(i=> i.id === id); }

export function saveView(){
  const views = JSON.parse(localStorage.getItem(LS.saved)||'[]');
  const params = new URLSearchParams();
  if(filters.term) params.set('q', filters.term);
  if(filters.tags.size) params.set('tags', Array.from(filters.tags).join(','));
  views.unshift(params.toString());
  localStorage.setItem(LS.saved, JSON.stringify(views.slice(0,20)));
  alert('Saved current view.');
}
export function copyLinkToFilters(){
  const params = new URLSearchParams();
  if(filters.term) params.set('q', filters.term);
  if(filters.tags.size) params.set('tags', Array.from(filters.tags).join(','));
  const url = location.origin + location.pathname + (params.toString()?('?'+params.toString()):'');
  navigator.clipboard.writeText(url).then(()=> alert('Link copied'));
}
export function exportCsv(){
  const rows = filtered();
  const header = ['id','title','department','laidDate','procedureKind','procedureScrutiny','breaks21DayRule','SLSC','JCSI'];
  const csv = [header].concat(rows.map(i=>[
    i.id, i.title, i.department, i.laidDate, i.procedure?.kind||'', i.procedure?.scrutiny||'', i.breaks21DayRule===true?'breach':(i.breaks21DayRule===false?'ok':''),
    i.committees?.SLSC?.flagged?'yes':'', i.committees?.JCSI?.flagged?'yes':''
  ].map(v=> `"${String(v || '').replace(/"/g,'""')}"`).join(','))).join('\r\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download='si-tracker.csv'; a.click();
}

export function openByHash(){
  const m = location.hash.match(/id=([^&]+)/);
  if(m){
    const id = decodeURIComponent(m[1]);
    const el = document.querySelector(`[data-id="${id}"]`);
    if(el){ el.click(); }
  }
}

export function setWatchHandlers(){
  return {
    export(){
      const ids = JSON.parse(localStorage.getItem(LS.watch)||'[]');
      const blob = new Blob([JSON.stringify({ids}, null, 2)], {type:'application/json'});
      const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='watchlist.json'; a.click();
    },
    import(e){
      const file = e.target.files?.[0]; if(!file) return;
      const reader = new FileReader();
      reader.onload = ()=>{
        try{
          const parsed = JSON.parse(reader.result);
          if(Array.isArray(parsed.ids)){
            localStorage.setItem(LS.watch, JSON.stringify(parsed.ids));
            alert('Watchlist imported.');
          }else alert('Invalid file.');
        }catch(err){ alert('Invalid JSON.'); }
      };
      reader.readAsText(file);
    }
  }
}
