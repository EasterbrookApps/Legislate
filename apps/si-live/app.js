
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const store = { get(k,d){ try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set(k,v){ localStorage.setItem(k, JSON.stringify(v)); } };

let rows = [];        // normalized SIs
let month = new Date();

// Settings
const settings = {
  lookbackDays: parseInt(localStorage.getItem('si-lookbackDays')||'120',10),
  maxPages: parseInt(localStorage.getItem('si-maxPages')||'10',10),
  autoMinutes: parseInt(localStorage.getItem('si-autoMinutes')||'0',10),
  proxy: localStorage.getItem('si-proxy') || ''
};

$('#lookback').value = settings.lookbackDays;
$('#maxPages').value = settings.maxPages;
$('#autoMins').value = settings.autoMinutes;
$('#saveSettings').addEventListener('click', ()=>{
  settings.lookbackDays = Math.max(7, parseInt($('#lookback').value||'120',10));
  settings.maxPages = Math.max(1, parseInt($('#maxPages').value||'10',10));
  settings.autoMinutes = Math.max(0, parseInt($('#autoMins').value||'0',10));
  localStorage.setItem('si-lookbackDays', settings.lookbackDays);
  localStorage.setItem('si-maxPages', settings.maxPages);
  localStorage.setItem('si-autoMinutes', settings.autoMinutes);
  scheduleAuto();
  refresh();
});

// Theme
$('#toggleTheme')?.addEventListener('click', ()=>{
  const root = document.documentElement;
  if (root.classList.contains('theme-dark')) { root.classList.remove('theme-dark'); root.classList.add('theme-light'); }
  else if (root.classList.contains('theme-light')) { root.classList.remove('theme-light'); }
  else { root.classList.add('theme-dark'); }
});

// Tabs
$$('.tabs button').forEach(b=>b.addEventListener('click',()=>{
  $$('.tabs button').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  $$('.tab').forEach(x=>x.classList.remove('active'));
  $('#'+b.dataset.tab).classList.add('active');
  if (b.dataset.tab==='calendar') renderCalendar();
  if (b.dataset.tab==='list') renderList();
  if (b.dataset.tab==='reports') renderReports();
}));

// Connectivity indicator
function updateOnline(){ $('#offline').classList.toggle('hidden', navigator.onLine); }
window.addEventListener('online', updateOnline); window.addEventListener('offline', updateOnline); updateOnline();

// Helpers
const iso = d => d ? new Date(d).toISOString().slice(0,10) : '';
const addDays = (d,n)=>{ const x = new Date(d); x.setDate(x.getDate()+n); return x; };
const daysBetween = (a,b)=> Math.ceil((b - a) / (1000*3600*24));
const uniq = arr => Array.from(new Set(arr.filter(Boolean))).sort((a,b)=>a.localeCompare(b));

function fortyDayDeadline(laid) { if (!laid) return null; const d = new Date(laid); d.setDate(d.getDate() + 40); return d; }
function computeState(item){
  if (item.withdrawn) return 'withdrawn';
  if (item.dateApproved) return 'approved';
  const deadline = fortyDayDeadline(item.dateLaid);
  if (!deadline) return 'unknown';
  const today = new Date();
  return (deadline < today) ? 'overdue' : 'due';
}

// Fetch from Linked Data API
async function fetchPage(page){
  const base = "https://eldaddp.azurewebsites.net/paperslaid/type/StatutoryInstrument.json";
  const params = new URLSearchParams({ _view:"description", withdrawn:"false", _page:String(page), _orderby:"-dateLaid" });
  const url = base + "?" + params.toString();
  const res = await fetch(url);
  if (!res.ok) throw new Error("HTTP "+res.status);
  return res.json();
}
function g(bind, k){ return (bind[k] && (bind[k][0]?.value ?? bind[k])) || null; }
function mapItem(b){
  const title = g(b,'title') || g(b,'sideTitle') || '';
  const num = g(b,'identifier') || '';
  const laid = g(b,'dateLaid') || g(b,'date');
  const proc = g(b,'procedure') || '';
  const dept = g(b,'departmentPrinted') || '';
  const referral = (g(b,'referral')||'') + ' ' + (g(b,'referredToBody')||'');
  const approved = g(b,'dateApproved') || null;
  const withdrawn = g(b,'withdrawn') === true || g(b,'withdrawn') === 'true';
  const joint = g(b,'jointCommitteeOnStatutoryInstruments') === true || g(b,'jointCommitteeOnStatutoryInstruments') === 'true';
  const slsc = /secondary legislation scrutiny committee/i.test(referral);
  const internal = g(b,'internalLocation') || '';
  const url = internal && internal.startsWith('http') ? internal : null;
  const item = {
    id: g(b,'_about') || num || Math.random().toString(36).slice(2),
    title, siNumber: num, dateLaid: laid, procedure: proc, department: dept,
    referral: referral.trim(), dateApproved: approved, withdrawn, jcsi: joint, slsc, url
  };
  item.state = computeState(item);
  item.deadline = fortyDayDeadline(item.dateLaid);
  item.reported = !!(item.jcsi || item.slsc);
  return item;
}

// Refresh
async function refresh(){
  $('#lastSync').textContent = 'Loading…';
  try {
    const lb = new Date(); lb.setDate(lb.getDate() - settings.lookbackDays);
    let page = 0; const acc = [];
    while (page < settings.maxPages){
      const data = await fetchPage(page);
      const items = (data?.result?.items || []).map(mapItem);
      acc.push(...items);
      const oldest = items[items.length-1];
      if (!oldest || (oldest.dateLaid && new Date(oldest.dateLaid) < lb)) break;
      page++;
    }
    rows = dedupe(acc);
    store.set('si-live-rows', rows);
    $('#lastSync').textContent = 'Updated ' + new Date().toLocaleString();
    buildDeptChips();
    renderViews(); renderList(); renderCalendar(); renderReports();
    scheduleNotifications();
  } catch (e) {
    console.error(e);
    $('#lastSync').textContent = 'Failed to update: ' + e.message;
    rows = store.get('si-live-rows', []);
    buildDeptChips();
    renderViews(); renderList(); renderCalendar(); renderReports();
  }
}
function dedupe(list){ const byId = new Map(); list.forEach(x=>{ const k=(x.id || x.siNumber || (x.title+'|'+x.dateLaid)); if(!byId.has(k)) byId.set(k,x); }); return Array.from(byId.values()); }

// Filters & views
const active = { q:'', proc:'', state:'', committee:'', from:'', to:'', depts: [] };
function buildDeptChips(){
  const box = $('#deptChips'); box.innerHTML='';
  const depts = uniq(rows.map(r=>r.department));
  depts.forEach(d=>{
    const btn = document.createElement('button'); btn.className='chip'; btn.textContent=d || '(Unknown)';
    btn.addEventListener('click', ()=>{ const i=active.depts.indexOf(d); if(i>=0) active.depts.splice(i,1); else active.depts.push(d); renderList(); });
    box.appendChild(btn);
  });
}
function renderViews(){
  const views = store.get('si-views', []);
  const box = $('#views'); box.innerHTML='';
  views.forEach((v, idx)=>{
    const a = document.createElement('button'); a.className='chip'; a.textContent=v.name;
    a.addEventListener('click', ()=>{ Object.assign(active, v.filters); bindFilters(); renderList(); });
    box.appendChild(a);
  });
}
function bindFilters(){
  $('#q').value = active.q || '';
  $('#procedure').value = active.proc || '';
  $('#state').value = active.state || '';
  $('#committee').value = active.committee || '';
  $('#from').value = active.from || '';
  $('#to').value = active.to || '';
}
$('#saveView').addEventListener('click', ()=>{
  const name = prompt('Name this view'); if(!name) return;
  const views = store.get('si-views', []);
  views.push({ name, filters: JSON.parse(JSON.stringify(active)) });
  store.set('si-views', views); renderViews();
});

// List rendering
function renderList(){
  // capture current filters
  active.q = $('#q').value.trim().toLowerCase();
  active.proc = $('#procedure').value;
  active.state = $('#state').value;
  active.committee = $('#committee').value;
  active.from = $('#from').value;
  active.to = $('#to').value;

  const from = active.from ? new Date(active.from) : null;
  const to = active.to ? new Date(active.to) : null;

  const cards = $('#cards'); cards.innerHTML='';
  rows
    .filter(i => !active.q || (i.title||'').toLowerCase().includes(active.q) || (i.siNumber||'').toLowerCase().includes(active.q))
    .filter(i => !active.proc || i.procedure===active.proc)
    .filter(i => !active.state || (active.state==='reported' ? i.reported : i.state===active.state))
    .filter(i => !active.committee || (active.committee==='jcsi' ? i.jcsi : i.slsc))
    .filter(i => !from || (i.dateLaid && new Date(i.dateLaid) >= from))
    .filter(i => !to || (i.dateLaid && new Date(i.dateLaid) <= to))
    .filter(i => active.depts.length===0 || active.depts.includes(i.department))
    .sort((a,b)=> new Date(b.dateLaid||0) - new Date(a.dateLaid||0))
    .forEach(i => cards.appendChild(card(i)));
}
function badge(i){
  const parts = [];
  if (i.procedure) parts.push(`<span class="badge">${i.procedure}</span>`);
  if (i.department) parts.push(`<span class="badge">${i.department}</span>`);
  if (i.state==='approved') parts.push(`<span class="badge" title="Approved">Approved</span>`);
  else if (i.state==='withdrawn') parts.push(`<span class="badge" title="Withdrawn">Withdrawn</span>`);
  else if (i.state==='overdue') parts.push(`<span class="badge" title="40-day elapsed">40+ days</span>`);
  else if (i.deadline){
    const left = daysBetween(new Date(), i.deadline);
    parts.push(`<span class="badge" title="Days to 40-day">${left<=7? '≤7d' : left+'d'}</span>`);
  }
  if (i.jcsi) parts.push(`<span class="badge" title="JCSI">JCSI</span>`);
  if (i.slsc) parts.push(`<span class="badge" title="SLSC">SLSC</span>`);
  return parts.join(' ');
}
function timeline(i){
  const events = [];
  if (i.dateLaid) events.push({ label:'Laid', date:new Date(i.dateLaid), cls:'dot-green' });
  if (i.deadline) events.push({ label:'40-day', date:i.deadline, cls: (i.deadline < new Date()) ? 'dot-red' : 'dot-amber' });
  if (i.dateApproved) events.push({ label:'Approved', date:new Date(i.dateApproved), cls:'dot-green' });
  if (i.withdrawn) events.push({ label:'Withdrawn', date:new Date(i.withdrawn), cls:'dot-red' });
  return events.sort((a,b)=>a.date-b.date);
}
function card(i){
  const t = $('#cardTemplate').content.firstElementChild.cloneNode(true);
  const laid = i.dateLaid ? new Date(i.dateLaid).toLocaleDateString() : '';
  const deadline = i.deadline ? i.deadline.toLocaleDateString() : '';
  t.innerHTML = `<h3>${i.siNumber || ''} — ${i.title || ''}</h3>
    <p>${badge(i)}</p>
    <p>Laid: ${laid} ${deadline? ' · 40-day: '+deadline:''}</p>
    <div class="row">
      <button data-act="open">Open</button>
      ${i.url? `<a class="badge" href="${i.url}" target="_blank" rel="noopener">Parliament page</a>`:''}
    </div>`;
  t.querySelector('[data-act="open"]').addEventListener('click', ()=> openDetail(i));
  return t;
}
function openDetail(i){
  $('#d-title').textContent = `${i.siNumber || ''} — ${i.title || ''}`;
  $('#d-meta').textContent = `${i.procedure || ''}${i.department? ' · '+i.department:''}${i.dateLaid? ' · Laid '+new Date(i.dateLaid).toLocaleDateString():''}${i.deadline? ' · 40-day '+i.deadline.toLocaleDateString():''}`;
  const badges = $('#d-badges'); badges.innerHTML = badge(i);
  const ul = $('#d-timeline'); ul.innerHTML='';
  timeline(i).forEach(ev => { const li = document.createElement('li'); li.innerHTML = `<span class="dot ${ev.cls}"></span> <strong>${ev.label}</strong> — ${ev.date.toLocaleDateString()}`; ul.appendChild(li); });
  const links = $('#d-links'); links.innerHTML='';
  if (i.url){ const a = document.createElement('a'); a.href=i.url; a.target='_blank'; a.rel='noopener'; a.className='badge'; a.textContent='Parliament page'; links.appendChild(a); }
  $('#detail').showModal();
}
$('#d-close').addEventListener('click', ()=> $('#detail').close());

// Calendar & ICS
function renderCalendar(){
  const cal = $('#cal'); cal.innerHTML='';
  const label = $('.monthLabel');
  const y = month.getFullYear(), m = month.getMonth();
  const start = new Date(y, m, 1), end = new Date(y, m+1, 0);
  label.textContent = start.toLocaleString(undefined, {month:'long', year:'numeric'});
  const offset = (start.getDay()+6)%7; // Monday
  for (let i=0;i<offset;i++){ const d = document.createElement('div'); d.className='day'; cal.appendChild(d); }
  for (let day=1; day<=end.getDate(); day++){
    const cell = document.createElement('div'); cell.className='day';
    const date = new Date(y, m, day);
    cell.innerHTML = `<div class="date">${day}</div>`;
    rows.forEach(i=>{
      const d = i.deadline; if (!d) return;
      if (d.getFullYear()===date.getFullYear() && d.getMonth()===date.getMonth() && d.getDate()===date.getDate()){
        const left = daysBetween(new Date(), d);
        const div = document.createElement('div'); div.className='event';
        if (left < 0) div.classList.add('overdue'); else if (left <= 7) div.classList.add('soon');
        div.innerHTML = `<strong>${i.siNumber||''}</strong><div>${(i.title||'').slice(0,60)}</div>`;
        cell.appendChild(div);
      }
    });
    cal.appendChild(cell);
  }
}
$('#prevMonth').addEventListener('click', ()=>{ month.setMonth(month.getMonth()-1); renderCalendar(); });
$('#nextMonth').addEventListener('click', ()=>{ month.setMonth(month.getMonth()+1); renderCalendar(); });

$('#downloadICS').addEventListener('click', ()=>{
  const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//SI Live+//EN'];
  rows.forEach(i=>{
    if (!i.deadline) return;
    const d = i.deadline; const dt = d.toISOString().replace(/[-:]/g,'').split('.')[0]+'Z';
    const uid = (i.id||i.siNumber||Math.random().toString(36).slice(2))+'@si-live';
    lines.push('BEGIN:VEVENT');
    lines.push('UID:'+uid);
    lines.push('DTSTAMP:'+dt);
    lines.push('DTSTART:'+dt);
    lines.push('SUMMARY:'+ (i.siNumber||'SI') + ' 40-day deadline');
    lines.push('DESCRIPTION:' + (i.title||'') + (i.url? ' '+i.url : ''));
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  const blob = new Blob([lines.join('\\r\\n')], {type:'text/calendar'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'si-40day.ics'; a.click();
});

$('#printView').addEventListener('click', ()=> window.print());

// Reports (committee summaries)
function summarise(text, limit=60){
  const clean = text.replace(/\\s+/g,' ').trim();
  const sentences = clean.split(/(?<=[\\.!?])\\s+/).slice(0,5).join(' ');
  return sentences.split(' ').slice(0, limit).join(' ') + (clean.split(' ').length>limit?'…':'');
}
async function fetchText(url){
  const proxy = localStorage.getItem('si-proxy') || '';
  const target = proxy ? proxy + encodeURIComponent(url) : url;
  const res = await fetch(target); return res.text();
}
function extractSummary(html){
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const main = doc.querySelector('main, article, .content, #content, body');
  const text = (main? main.innerText : doc.body.innerText) || '';
  return summarise(text, 120);
}
async function fetchReportFor(item){
  // Heuristic: if Parliament page has links to committee reports, follow them (may require proxy).
  if (!item.url) return null;
  try {
    const html = await fetchText(item.url);
    // Try to spot report links
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const a = Array.from(doc.querySelectorAll('a')).find(x => /report|committee|JCSI|SLSC/i.test(x.textContent||''));
    if (!a) return null;
    const href = new URL(a.getAttribute('href'), item.url).href;
    const repHtml = await fetchText(href);
    return { url: href, summary: extractSummary(repHtml) };
  } catch (e) { return null; }
}
async function renderReports(){
  const box = $('#reportList'); box.innerHTML='';
  const flagged = rows.filter(r=>r.reported);
  if (flagged.length===0){ box.innerHTML = '<article class="card"><h3>No reported SIs yet</h3></article>'; return; }
  for (const it of flagged){
    const card = document.createElement('article'); card.className='card';
    card.innerHTML = `<h3>${it.siNumber || ''} — ${it.title || ''}</h3><p>${it.procedure||''}${it.department? ' · '+it.department:''}</p><div class="row">${it.url? `<a class="badge" href="${it.url}" target="_blank" rel="noopener">Parliament page</a>`:''}</div><p class="muted small">Fetching summary…</p>`;
    box.appendChild(card);
    // Lazy fetch summary
    fetchReportFor(it).then(rep => {
      if (!rep) { card.querySelector('.muted').textContent = 'No accessible report summary found.'; return; }
      card.querySelector('.muted').remove();
      const p = document.createElement('p'); p.textContent = rep.summary; card.appendChild(p);
      const a = document.createElement('a'); a.href = rep.url; a.target='_blank'; a.rel='noopener'; a.className='badge'; a.textContent='Open report'; card.appendChild(a);
    }).catch(()=>{ card.querySelector('.muted').textContent = 'Failed to fetch summary (CORS?)'; });
  }
}
$('#saveProxy').addEventListener('click', ()=>{
  const val = $('#proxyUrl').value.trim();
  localStorage.setItem('si-proxy', val);
  alert('Saved proxy URL.');
});
$('#fetchSummaries').addEventListener('click', ()=> renderReports());
$('#proxyUrl').value = settings.proxy;

// Notifications (due soon)
function scheduleNotifications(){
  if (Notification.permission !== 'granted') return;
  const soon = rows.filter(i => i.deadline && daysBetween(new Date(), i.deadline) <= 7 && daysBetween(new Date(), i.deadline) >= 0);
  soon.slice(0,10).forEach(i => {
    new Notification((i.siNumber||'SI')+' due soon', { body: i.title||'', icon: './icons/icon-192.png' });
  });
}
$('#enableNotifs').addEventListener('click', async ()=>{
  try{
    const res = await Notification.requestPermission();
    if (res === 'granted'){ scheduleNotifications(); }
    else alert('Notifications not granted.');
  } catch(e){ alert('Not supported: '+e.message); }
});
$('#testNotif').addEventListener('click', ()=>{
  if (Notification.permission === 'granted'){
    new Notification('SI Live+ test', { body: 'This is a test notification.', icon:'./icons/icon-192.png' });
  } else { alert('Enable notifications first.'); }
});

// Auto-refresh
let timer = null;
function scheduleAuto(){
  if (timer) clearInterval(timer);
  if (settings.autoMinutes > 0){
    timer = setInterval(refresh, settings.autoMinutes*60*1000);
  }
}
scheduleAuto();

// Inputs
$('#q').addEventListener('input', renderList);
$('#procedure').addEventListener('change', renderList);
$('#state').addEventListener('change', renderList);
$('#committee').addEventListener('change', renderList);
$('#from').addEventListener('change', renderList);
$('#to').addEventListener('change', renderList);
$('#refresh').addEventListener('click', refresh);
$('#exportCSV').addEventListener('click', ()=>{
  const header = ['siNumber','title','dateLaid','deadline','procedure','department','state','jcsi','slsc','url'];
  const rowsCSV = rows.map(i => [
    i.siNumber||'', (i.title||'').replaceAll('"','""'), iso(i.dateLaid||i.dateLaid), i.deadline? iso(i.deadline):'',
    i.procedure||'', i.department||'', i.state||'', i.jcsi?1:0, i.slsc?1:0, i.url||''
  ]);
  const lines = [header.join(','), ...rowsCSV.map(r => [r[0],`"${r[1]}"`,...r.slice(2)].join(','))];
  const blob = new Blob([lines.join('\\r\\n')], {type:'text/csv'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'si-live.csv'; a.click();
});

// Initial load
refresh();
