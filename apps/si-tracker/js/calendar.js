
import { all } from './data.js';
let current = new Date();
let showMotions = true, showDLC = true;
const calEl = document.getElementById('calendar-grid');

export function buildCalendar(offset=0){
  showMotions = document.getElementById('calShowMotions')?.checked !== false;
  showDLC = document.getElementById('calShowDLC')?.checked !== false;
  if(offset === 0) current = new Date();
  else current.setMonth(current.getMonth() + offset);

  const year = current.getFullYear(), month = current.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month+1, 0);
  const start = new Date(first); start.setDate(1 - ((first.getDay()+6)%7));
  const end = new Date(last); end.setDate(last.getDate() + (7 - ((last.getDay()+6)%7) - 1));

  const days = [];
  for(let d=new Date(start); d<=end; d.setDate(d.getDate()+1)) days.push(new Date(d));

  const head = `<div class="head"><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div><div>Sun</div></div>`;
  const cells = days.map(d=>{
    const ds = d.toISOString().slice(0,10);
    const events = all.events.filter(e=> e.date === ds).filter(e=> (e.kind==='motion' && showMotions) || (e.kind==='dlc' && showDLC) || (!e.kind && showMotions));
    const list = events.map(e=> `<div class="event ${e.house==='Lords'?'lords':''} ${e.kind==='dlc'?'dlc':''}">${e.house||''} • ${escapeHtml(e.title||'')}</div>`).join('');
    return `<div class="cell">
      <div class="date">${d.getMonth()===month?'<strong>':''}${d.getDate()}${d.getMonth()===month?'</strong>':''}</div>
      ${list}
    </div>`;
  }).join('');

  calEl.innerHTML = head + `<div class="grid">${cells}</div>`;
}

export function exportICS(){
  const year = current.getFullYear(), month = current.getMonth()+1;
  const evs = all.events.filter(e=>{
    const [y,m] = e.date.split('-').map(Number);
    return y===year && m===month;
  });
  const ics = [
    'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//SI Tracker//EN'
  ];
  for(const e of evs){
    ics.push('BEGIN:VEVENT');
    ics.push('UID:'+ e.date + '-' + (e.title||'').replace(/\W+/g,'') + '@si-tracker');
    ics.push('DTSTAMP:' + e.date.replace(/-/g,'') + 'T090000Z');
    ics.push('DTSTART;VALUE=DATE:' + e.date.replace(/-/g,''));
    ics.push('SUMMARY:' + (e.title||'') + (e.house?(' ('+e.house+')') : ''));
    ics.push('END:VEVENT');
  }
  ics.push('END:VCALENDAR');
  const blob = new Blob([ics.join('\r\n')], {type:'text/calendar'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download='si-tracker.ics'; a.click();
}

function escapeHtml(s){ return (s||'').replace(/[&<>"]/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' })[c]); }
