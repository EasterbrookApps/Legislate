
import { loadData, searchAll, toggleFilter, filters, setBasePath, applyQueryFromURL, saveView, copyLinkToFilters, exportCsv, openByHash, setWatchHandlers } from './data.js';
import { renderCards, openDrawer, renderArchiveCards, renderWatchCards } from './cards.js';
import { buildCalendar, exportICS } from './calendar.js';

setBasePath(window.location.pathname.replace(/\/index\.html$/, '').replace(/\/$/, '') + '/');

const tabs = document.querySelectorAll('.tab');
const views = document.querySelectorAll('.view');
tabs.forEach(btn=>{
  btn.addEventListener('click', ()=>{
    tabs.forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    views.forEach(v=> v.hidden = v.id !== btn.dataset.tab);
    if (btn.dataset.tab === 'calendar') buildCalendar(0);
    if (btn.dataset.tab === 'watch') renderWatchCards(openDrawer);
  });
});

// Search
const q = document.getElementById('q');
q.addEventListener('keydown', (e)=>{
  if(e.key === 'Enter'){
    searchAll(q.value.trim());
    render();
  }
});

// Filters
document.querySelectorAll('[data-filter]').forEach(chip=>{
  chip.addEventListener('click', ()=>{
    const on = chip.getAttribute('data-on') === 'true';
    chip.setAttribute('data-on', on ? 'false' : 'true');
    toggleFilter(chip.dataset.filter, !on);
    render();
  });
});

// Toolbar buttons
document.getElementById('saveView').addEventListener('click', ()=> saveView());
document.getElementById('copyLink').addEventListener('click', ()=> copyLinkToFilters());
document.getElementById('exportCsv').addEventListener('click', ()=> exportCsv());

// Drawer close & accessibility
document.getElementById('closeDrawer').addEventListener('click', close);
document.querySelector('#drawer .shade').addEventListener('click', close);
function close(){
  document.getElementById('drawer').classList.remove('open');
  document.getElementById('drawer').setAttribute('aria-hidden','true');
  document.querySelector('#main')?.focus();
}
document.addEventListener('keydown', (e)=>{
  if(e.key === 'Escape'){
    if(!document.getElementById('drawer').classList.contains('open')) return;
    close();
  }
});

// Calendar controls
document.getElementById('prevMonth').addEventListener('click', ()=> buildCalendar(-1));
document.getElementById('today').addEventListener('click', ()=> buildCalendar(0));
document.getElementById('nextMonth').addEventListener('click', ()=> buildCalendar(1));
document.getElementById('exportICS').addEventListener('click', ()=> exportICS());

// Watchlist import/export
document.getElementById('exportWatch').addEventListener('click', ()=> setWatchHandlers().export());
document.getElementById('importWatch').addEventListener('change', (e)=> setWatchHandlers().import(e));

// Initial load
await loadData();
applyQueryFromURL();
render();
renderArchiveCards();
openByHash(); // deep link: #id=...

// Build info
if(window.__buildInfo){
  const el = document.getElementById('buildInfo');
  el.textContent = `Build: ${window.__buildInfo.when||'—'} • Items: ${window.__buildInfo.count||'—'} • Schema: ${window.__buildInfo.schema||'—'}`;
}

function render(){
  renderCards(openDrawer);
  // Update URL query with current filters (for shareable views)
  const params = new URLSearchParams();
  if(filters.term) params.set('q', filters.term);
  if(filters.tags.size) params.set('tags', Array.from(filters.tags).join(','));
  history.replaceState(null, '', params.toString() ? ('?' + params.toString()) : location.pathname);
}

