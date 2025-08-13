// scripts/build-data.mjs (refined v3)
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const dataDir = path.join(repoRoot, 'data');
const feedsDir = path.join(repoRoot, 'feeds');

const ENDPOINT = 'https://api.parliament.uk/sparql';

async function sparql(query){
  const res = await fetch(ENDPOINT, {
    method:'POST', headers: { 'content-type':'application/sparql-query', 'accept':'application/sparql-results+json' }, body: query
  });
  if(!res.ok){ throw new Error(`SPARQL ${res.status}`); }
  return await res.json();
}
const q = (name)=> fs.readFile(path.join(__dirname, 'queries', name), 'utf8');
const val = (b)=> b?.value ?? null;

async function fetchHTML(url){
  const res = await fetch(url, { headers: { 'accept':'text/html' } });
  if(!res.ok) return null;
  return await res.text();
}

function cleanHTML(html){
  if(!html) return null;
  // Strip scripts/styles/iframes and most attributes
  html = html.replace(/<script[\s\S]*?<\/script>/gi,'')
             .replace(/<style[\s\S]*?<\/style>/gi,'')
             .replace(/<iframe[\s\S]*?<\/iframe>/gi,'');
  // Remove event handlers
  html = html.replace(/\son\w+="[^"]*"/gi,'').replace(/\son\w+='[^']*'/gi,'');
  // Keep basic tags; in practice we embed inside our container safely
  return html;
}

function extractCIFs(text){
  const t = (text||'').replace(/\s+/g, ' ');
  const rx = /(come into force|coming into force)[^0-9]{0,40}(\d{1,2}\s+[A-Za-z]+\s+\d{4})/gi;
  const out = new Set(); let m;
  while((m = rx.exec(t))) out.add(normalise(m[2]));
  return Array.from(out).filter(Boolean).sort();
}

function normalise(s){
  try{
    const dt = new Date(s);
    if(!isNaN(dt)) return dt.toISOString().slice(0,10);
  }catch(e){}
  return null;
}
function daysBetween(a,b){
  const A = new Date(a+'T00:00:00Z'), B = new Date(b+'T00:00:00Z');
  return Math.round((B - A)/86400000);
}
function breach21(laid, cifs){
  if(!laid || !cifs?.length) return null;
  return daysBetween(laid, cifs[0]) < 21;
}

async function main(){
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(feedsDir, { recursive: true });

  const [baseQ, cmsQ, motQ] = await Promise.all([q('base-sis.sparql'), q('committees.sparql'), q('motions.sparql')]);
  const [base, cms, mot] = await Promise.all([sparql(baseQ), sparql(cmsQ), sparql(motQ)]);

  const items = new Map();
  for(const r of base.results.bindings){
    const id = val(r.workPackage); if(!id) continue;
    const o = items.get(id) || { id, events: [], committees: {} };
    o.title = val(r.title) || o.title || '';
    o.laidDate = val(r.laidDate) || o.laidDate || null;
    o.procedure = { kind: val(r.procedureKind) || o.procedure?.kind || null, scrutiny: val(r.procedureScrutiny) || o.procedure?.scrutiny || null };
    o.links = o.links || {}; o.links.legislation = val(r.legislationURI) || o.links.legislation || null;
    o.department = val(r.departmentLabel) || o.department || null;
    items.set(id, o);
  }

  for(const r of cms.results.bindings){
    const id = val(r.workPackage); if(!id) continue;
    const o = items.get(id) || { id, events: [], committees: {} };
    if(val(r.slscFlag) === 'true') o.committees.SLSC = { ...(o.committees.SLSC||{}), flagged: true, report: val(r.slscReportURI) || null };
    if(val(r.jcsiFlag) === 'true') o.committees.JCSI = { ...(o.committees.JCSI||{}), flagged: true };
    items.set(id, o);
  }

  for(const r of mot.results.bindings){
    const id = val(r.workPackage); if(!id) continue;
    const o = items.get(id) || { id, events: [], committees: {} };
    o.events.push({ date: val(r.date)?.slice(0,10) || null, house: val(r.houseLabel) || null, label: val(r.label) || 'Approval motion tabled', kind: 'motion' });
    items.set(id, o);
  }

  // Previous snapshot for diffs
  let prev = []; try{ prev = JSON.parse(await fs.readFile(path.join(dataDir,'instruments.json'),'utf8')); }catch{ prev = []; }
  const prevMap = new Map(prev.map(x=> [x.id, x]));

  const docs = []; const calEvents = [];
  for(const [id, it] of items){
    // EM inline HTML
    if(it.links?.legislation){
      const emURL = (it.links.legislation.replace(/\/contents\/made.*/,'') + '/memorandum/contents');
      it.links.memorandum = emURL;
      const html = await fetchHTML(emURL);
      it.emHtml = cleanHTML(html);
      const legHTML = await fetchHTML(it.links.legislation);
      const cifs = extractCIFs(legHTML);
      if(cifs.length) it.comesIntoForce = cifs;
      if(it.procedure?.kind === 'made' && it.procedure?.scrutiny === 'negative'){
        it.breaks21DayRule = breach21(it.laidDate, cifs);
      } else it.breaks21DayRule = null;
      // search doc
      docs.push({ id, content: [it.title, (it.emHtml||'').replace(/<[^>]+>/g,' ')].join(' ') });
    }
    if((it.procedure?.scrutiny||'') === 'affirmative'){
      for(const ev of (it.events||[])){
        if(ev.date) calEvents.push({ date: ev.date, title: it.title, house: ev.house, kind: ev.kind||'motion' });
      }
    }

    // diffs
    const before = prevMap.get(id);
    const changed = [];
    if(before){
      if(before.breaks21DayRule !== it.breaks21DayRule) changed.push('21-day');
      const prevFlags = [before.committees?.SLSC?.flagged, before.committees?.JCSI?.flagged].join(',');
      const nowFlags = [it.committees?.SLSC?.flagged, it.committees?.JCSI?.flagged].join(',');
      if(prevFlags !== nowFlags) changed.push('committee');
      if(JSON.stringify(before.events||[]) !== JSON.stringify(it.events||[])) changed.push('events');
    }
    if(changed.length) it.changed = changed;
  }

  const list = Array.from(items.values()).sort((a,b)=> (b.laidDate||'').localeCompare(a.laidDate||''));
  // sanity checks
  if(list.length < 5) throw new Error('Dataset too small; abort commit.');

  await fs.writeFile(path.join(dataDir,'instruments.json'), JSON.stringify(list, null, 2));
  await fs.writeFile(path.join(dataDir,'affirmative-events.json'), JSON.stringify(calEvents.sort((a,b)=> a.date.localeCompare(b.date)), null, 2));
  await fs.writeFile(path.join(dataDir,'lunr-index.json'), JSON.stringify({docs}, null, 2));
  try{ await fs.access(path.join(dataDir,'archive.json')); }catch{ await fs.writeFile(path.join(dataDir,'archive.json'), JSON.stringify({ids:[]}, null, 2)); }

  // feeds
  const newly = list.slice(0, 50).map(pick); // top 50 recent
  const aff = list.filter(i=> i.procedure?.scrutiny==='affirmative').map(pick);
  const brk = list.filter(i=> i.breaks21DayRule===true).map(pick);
  await fs.writeFile(path.join(feedsDir,'newly-laid.json'), JSON.stringify(newly, null, 2));
  await fs.writeFile(path.join(feedsDir,'affirmatives.json'), JSON.stringify(aff, null, 2));
  await fs.writeFile(path.join(feedsDir,'breaches.json'), JSON.stringify(brk, null, 2));

  // build info
  await fs.writeFile(path.join(dataDir,'build.json'), JSON.stringify({when: new Date().toISOString(), count:list.length, schema:'v1.2'}, null, 2));

  console.log('Done.');
}

function pick(i){
  return { id:i.id, title:i.title, laidDate:i.laidDate, department:i.department, procedure:i.procedure, breaks21DayRule:i.breaks21DayRule };
}

main().catch(e=>{ console.error(e); process.exitCode=1; });
