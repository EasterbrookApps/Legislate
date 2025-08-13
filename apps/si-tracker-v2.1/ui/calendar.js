// Calendar view with month/week toggle and event-type filters
function renderCalendar(){
  const viewPref = localStorage.getItem('calView') || 'month';
  const show = { motion: true, dlc: true, debate: true };
  const container = document.getElementById('view');
  container.innerHTML = `<div class="calendar-bar">
    <label>View
      <select id="calView">
        <option value="month"${viewPref==='month'?' selected':''}>Month</option>
        <option value="week"${viewPref==='week'?' selected':''}>Week</option>
      </select>
    </label>
    <label><input type="checkbox" id="showMotion" checked> Motions</label>
    <label><input type="checkbox" id="showDlc" checked> DL Committees</label>
    <label><input type="checkbox" id="showDebate" checked> Debates</label>
    <div class="legend">
      <span class="dot motion"></span> Motions
      <span class="dot dlc"></span> DL Committees
      <span class="dot debate"></span> Debates
    </div>
  </div>
  <div id="cal"></div>`;

  const cal = document.getElementById('cal');
  const events = (window.state?.data?.events||[]).filter(e=> show[e.kind||'motion']!==false);

  function startOfWeek(d){
    const dt = new Date(d); const day=dt.getDay();
    const diff = (day===0? -6 : 1) - day; // Monday start
    dt.setDate(dt.getDate()+diff); dt.setHours(0,0,0,0); return dt;
  }
  function renderMonth(){
    const today = new Date(); const y=today.getFullYear(), m=today.getMonth();
    const first = new Date(y,m,1); const last = new Date(y,m+1,0);
    const weeks = []; let cur = startOfWeek(first);
    while(cur<=last || cur.getMonth()===first.getMonth()){
      const week=[];
      for(let i=0;i<7;i++){ const d=new Date(cur); week.push(d); cur.setDate(cur.getDate()+1); }
      weeks.push(week);
    }
    cal.innerHTML = weeks.map(week=>`<div class="week" style="display:grid;grid-template-columns:repeat(7,1fr);gap:8px;margin-bottom:8px;">
      ${week.map(d=>{
        const ds = d.toISOString().slice(0,10);
        const dayEvents = events.filter(e=> e.date===ds);
        return `<div class="section"><div style="font-weight:600">${d.getDate()}</div>
          ${dayEvents.map(e=> `<div class="badge ${e.kind||'motion'}">${e.title||e.label||'Event'}</div>`).join('')}
        </div>`;
      }).join('')}
    </div>`).join('');
  }
  function renderWeek(){
    const today = new Date();
    const start = startOfWeek(today);
    const days = Array.from({length:7},(_,i)=> new Date(start.getFullYear(), start.getMonth(), start.getDate()+i));
    cal.innerHTML = `<div class="week" style="display:grid;grid-template-columns:repeat(7,1fr);gap:8px;">
      ${days.map(d=>{
        const ds = d.toISOString().slice(0,10);
        const dayEvents = events.filter(e=> e.date===ds);
        return `<div class="section"><div style="font-weight:600">${d.toLocaleDateString(undefined,{weekday:'short'})} ${d.getDate()}</div>
          ${dayEvents.map(e=> `<div class="badge ${e.kind||'motion'}">${e.title||e.label||'Event'}</div>`).join('')}
        </div>`;
      }).join('')}
    </div>`;
  }

  function refresh(){
    const view = document.getElementById('calView').value;
    localStorage.setItem('calView', view);
    if(view==='week') renderWeek(); else renderMonth();
  }
  document.getElementById('calView').onchange = refresh;
  document.getElementById('showMotion').onchange = (e)=>{ show.motion=e.target.checked; refresh(); };
  document.getElementById('showDlc').onchange = (e)=>{ show.dlc=e.target.checked; refresh(); };
  document.getElementById('showDebate').onchange = (e)=>{ show.debate=e.target.checked; refresh(); };
  refresh();
}
