// apps/si-tracker/scripts/build-data.mjs
// Node 20+ (has fetch built-in)
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..'); // apps/si-tracker
const dataDir = path.join(repoRoot, 'data');
const feedsDir = path.join(repoRoot, 'feeds');
const queriesDir = path.join(__dirname, 'queries');

const ENDPOINT = 'https://api.parliament.uk/sparql';

async function sparql(query){
  const res = await fetch(ENDPOINT, {
    method:'POST',
    headers: { 'content-type':'application/sparql-query', 'accept':'application/sparql-results+json' },
    body: query
  });
  if(!res.ok){
    const txt = await res.text().catch(()=>'');
    throw new Error(`SPARQL ${res.status}: ${txt.substring(0,200)}`);
  }
  return await res.json();
}
const q = (name)=> fs.readFile(path.join(queriesDir, name), 'utf8');
const val = (b)=> b?.value ?? null;

async function fetchHTML(url){
  try{
    const res = await fetch(url, { headers: { 'accept':'text/html' } });
    if(!res.ok) return null;
    return await res.text();
  }catch{ return null; }
}
function cleanHTML(html){
  if(!html) return null;
  return html
    .replace(/<script[\s\S]*?<\/script>/gi,'')
    .replace(/<style[\s\S]*?<\/style>/gi,'')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi,'')
    .replace(/\son\w+=("[^"]*"|'[^']*')/gi, '');
}
function extractCIFs(text){
  if(!text) return [];
  const t = text.replace(/\s+/g,' ');
  const rx = /(come into force|coming into force)[^0-9]{0,40}(\d{1,2}\s+[A-Za-z]+\s+\d{4})/gi;
  const out = new Set(); let m;
  while((m = rx.exec(t))) out.add(normalise(m[2]));
  return Array.from(out).filter(Boolean).sort();
}
function normalise(s){ try{ const d = new Date(s); if(!isNaN(d)) return d.toISOString().slice(0,10);}catch{} return null; }
function daysBetween(a,b){ return Math.round((new Date(b+'T00:00:00Z') - new Date(a+'T00:00:00Z'))/86400000); }
function breach21(laid, cifs){ if(!laid||!cifs?.length) return null; return daysBetween(laid, cifs[0]) < 21; }

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
    o.laidDate = val(r.laidDate) || o.laidDate || val(r.keyDate) || null;
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

  // Build EM content + CIF parse
  const docs = []; const calEvents = [];
  for(const [id, it] of items){
    if(it.links?.legislation){
      const emURL = (it.links.legislation.replace(/\/contents\/made.*/,'') + '/memorandum/contents');
      it.links.memorandum = emURL;
      const emHTML = await fetchHTML(emURL);
      it.emHtml = cleanHTML(emHTML);
      const legHTML = await fetchHTML(it.links.legislation);
      const cifs = extractCIFs(legHTML);
      if(cifs.length) it.comesIntoForce = cifs;
      if(it.procedure?.kind === 'made' && it.procedure?.scrutiny === 'negative'){
        it.breaks21DayRule = breach21(it.laidDate, cifs);
      } else it.breaks21DayRule = null;
      docs.push({ id, content: [it.title, (it.emHtml||'').replace(/<[^>]+>/g,' ')].join(' ') });
    }
    if((it.procedure?.scrutiny||'') === 'affirmative'){
      for(const ev of (it.events||[])){ if(ev.date) calEvents.push({ date: ev.date, title: it.title, house: ev.house, kind: ev.kind||'motion' }); }
    }
  }

  const list = Array.from(items.values()).sort((a,b)=> (b.laidDate||'').localeCompare(a.laidDate||''));

  // --- Relaxed dataset threshold (allow very small initial datasets) ---
  if(list.length < 1){
    console.warn('Warning: very small dataset (', list.length, ') — committing anyway.');
  }

  await fs.writeFile(path.join(dataDir,'instruments.json'), JSON.stringify(list, null, 2));
  await fs.writeFile(path.join(dataDir,'affirmative-events.json'), JSON.stringify(calEvents.sort((a,b)=> a.date.localeCompare(b.date)), null, 2));
  await fs.writeFile(path.join(dataDir,'lunr-index.json'), JSON.stringify({docs}, null, 2));
  try{ await fs.access(path.join(dataDir,'archive.json')); }catch{ await fs.writeFile(path.join(dataDir,'archive.json'), JSON.stringify({ids:[]}, null, 2)); }

  // Feeds (JSON)
  const pick = (i)=> ({ id:i.id, title:i.title, laidDate:i.laidDate, department:i.department, procedure:i.procedure, breaks21DayRule:i.breaks21DayRule });
  await fs.mkdir(feedsDir, { recursive: true });
  await fs.writeFile(path.join(feedsDir,'newly-laid.json'), JSON.stringify(list.slice(0,50).map(pick), null, 2));
  await fs.writeFile(path.join(feedsDir,'affirmatives.json'), JSON.stringify(list.filter(i=> i.procedure?.scrutiny==='affirmative').map(pick), null, 2));
  await fs.writeFile(path.join(feedsDir,'breaches.json'), JSON.stringify(list.filter(i=> i.breaks21DayRule===true).map(pick), null, 2));

  // Build info
  await fs.writeFile(path.join(dataDir,'build.json'), JSON.stringify({when: new Date().toISOString(), count:list.length, schema:'v1.2'}, null, 2));

  console.log('Build complete. Items:', list.length);
}

main().catch(e=>{ console.error(e); process.exitCode = 1; });
