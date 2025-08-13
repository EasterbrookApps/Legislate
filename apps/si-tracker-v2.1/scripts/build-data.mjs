// apps/si-tracker-v2.1/scripts/build-data.mjs — timeline patch
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const dataDir = path.join(appRoot, 'data');
const feedsDir = path.join(appRoot, 'feeds');
const queriesDir = path.join(__dirname, 'queries');

const ENDPOINT = 'https://api.parliament.uk/sparql';
const SINCE = process.env.SI_SINCE || '2024-07-04';

async function sparql(query){
  const q = query.replace(/\?since\b/g, `"${SINCE}"^^<http://www.w3.org/2001/XMLSchema#date>`);
  const res = await fetch(ENDPOINT, {
    method:'POST',
    headers: { 'content-type':'application/sparql-query', 'accept':'application/sparql-results+json' },
    body: q
  });
  if(!res.ok){
    const txt = await res.text().catch(()=>'');
    throw new Error(`SPARQL ${res.status}: ${txt.substring(0,300)}`);
  }
  return await res.json();
}
const readQ = (rel)=> fs.readFile(path.join(queriesDir, rel), 'utf8');
const val = (b)=> b?.value ?? null;

async function fetchHTML(url){
  try{
    const res = await fetch(url, { headers: { 'accept':'text/html' } });
    if(!res.ok) return null;
    return await res.text();
  }catch{ return null; }
}
function stripHtml(html){
  return (html||'').replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ');
}
function extractCIFs(text){
  if(!text) return [];
  const t = text.replace(/\s+/g,' ');
  const rx = /(come into force|coming into force)[^0-9]{0,40}(\d{1,2}\s+[A-Za-z]+\s+\d{4})/gi;
  const out = new Set(); let m; while((m = rx.exec(t))) out.add(normalise(m[2]));
  return Array.from(out).filter(Boolean).sort();
}
function normalise(s){ try{ const d=new Date(s); if(!isNaN(d)) return d.toISOString().slice(0,10);}catch{} return null; }
function daysBetween(a,b){ return Math.round((new Date(b+'T00:00:00Z') - new Date(a+'T00:00:00Z'))/86400000); }
function breach21(laid, cifs){ if(!laid||!cifs?.length) return null; return daysBetween(laid, cifs[0]) < 21; }

async function main(){
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(feedsDir, { recursive: true });

  // Read queries
  const [baseQ, committeesQ, jcsiQ, motionsQ, currentQ, commonsOnlyQ, timelineQ] = await Promise.all([
    readQ('base-sis.sparql'),
    readQ('committees.sparql'),
    readQ('jcsi.sparql'),
    readQ('motions.sparql'),
    readQ('currently-before.sparql'),
    readQ('commons-only.sparql'),
    readQ('procedure-steps-all.sparql')
  ]);

  // Execute
  const [base, committees, jcsi, motions, current, commonsOnly, timeline] = await Promise.all([
    sparql(baseQ), sparql(committeesQ), sparql(jcsiQ), sparql(motionsQ), sparql(currentQ), sparql(commonsOnlyQ), sparql(timelineQ)
  ]);

  // Build base items
  const items = new Map();
  for(const r of base.results.bindings){
    const id = val(r.workPackage); if(!id) continue;
    const o = items.get(id) || { id, events: [], committees: {}, status: 'current', tags: [] };
    o.title = val(r.title) || o.title || '';
    // Prefer laid date from base query if provided, else null; will refine from timeline later
    o.laidDate = val(r.laidDate) || val(r.laidOrMadeDate) || o.laidDate || null;
    o.procedure = { kind: val(r.procedureKind) || o.procedure?.kind || null, scrutiny: val(r.procedureScrutiny) || o.procedure?.scrutiny || null };
    o.links = o.links || {}; o.links.legislation = val(r.legislationURI) || o.links.legislation || null;
    o.department = val(r.departmentLabel) || o.department || null;
    items.set(id, o);
  }

  // Committees
  for(const r of committees.results.bindings){
    const id = val(r.workPackage); if(!id) continue;
    const o = items.get(id) || { id, events: [], committees: {}, status:'current', tags:[] };
    o.committees.SLSC = { ...(o.committees.SLSC||{}), flagged: true, report: val(r.slscReportURI) || null };
    items.set(id, o);
  }
  for(const r of jcsi.results.bindings){
    const id = val(r.workPackage); if(!id) continue;
    const o = items.get(id) || { id, events: [], committees: {}, status:'current', tags:[] };
    o.committees.JCSI = { ...(o.committees.JCSI||{}), flagged: true };
    items.set(id, o);
  }

  // Motions (affirmatives)
  for(const r of motions.results.bindings){
    const id = val(r.workPackage); if(!id) continue;
    const o = items.get(id) || { id, events: [], committees: {}, status:'current', tags:[] };
    o.events.push({ date: val(r.date)?.slice(0,10) || null, house: val(r.houseLabel) || null, label: val(r.label) || 'Approval motion tabled', kind: 'motion' });
    items.set(id, o);
  }

  // Current + Commons-only flags
  const currentSet = new Set(current.results.bindings.map(r=> val(r.workPackage)).filter(Boolean));
  const commonsSet = new Set(commonsOnly.results.bindings.map(r=> val(r.workPackage)).filter(Boolean));

  for(const [id, o] of items){
    if(!currentSet.has(id) && o.status === 'current'){ o.status = o.status; }
    if(commonsSet.has(id)) o.commonsOnly = true;
  }

  // Timeline merge: attach ordered steps; derive laidDate from specific laid steps
  const LAID_IDS = new Set(['https://id.parliament.uk/cspzmb6w','https://id.parliament.uk/WkH5enjt']);
  const perWp = new Map();
  for(const r of timeline.results.bindings){
    const wp = val(r.workPackage); if(!wp) continue;
    const step = { stepURI: val(r.stepURI), stepLabel: val(r.stepLabel)||'', date: (val(r.date)||'').slice(0,10)||null, house: val(r.houseLabel)||null, layingBody: val(r.layingBodyName)||null };
    if(!perWp.has(wp)) perWp.set(wp, []);
    perWp.get(wp).push(step);
  }
  for(const [id, steps] of perWp){
    steps.sort((a,b)=> (a.date||'').localeCompare(b.date||''));
    const o = items.get(id); if(!o) continue;
    o.timeline = steps;
    // Derive laid date from laid step entries if present
    const laidStep = steps.find(s=> LAID_IDS.has(s.stepURI));
    if(laidStep?.date) o.laidDate = laidStep.date;
  }

  // Enrich with Memorandum + CIF + attention score
  const docs = []; const calEvents = [];
  for(const [id, it] of items){
    if(it.links?.legislation){
      const emURL = it.links.legislation.replace(/\/contents\/made.*/,'') + '/memorandum/contents';
      it.links.memorandum = emURL;
      const [emHTML, legHTML] = await Promise.all([fetchHTML(emURL), fetchHTML(it.links.legislation)]);
      const emText = stripHtml(emHTML);
      if(emText) it.emHtml = emHTML;
      const cifs = extractCIFs(legHTML);
      if(cifs.length) it.comesIntoForce = cifs;
      if(it.procedure?.kind === 'made' && it.procedure?.scrutiny === 'negative'){
        it.breaks21DayRule = breach21(it.laidDate, cifs);
      } else it.breaks21DayRule = null;
      docs.push({ id, content: [it.title, emText || ''].join(' ') });
    }
    if((it.procedure?.scrutiny||'') === 'affirmative'){
      for(const ev of (it.events||[])){ if(ev.date) calEvents.push({ date: ev.date, title: it.title, house: ev.house, kind: ev.kind||'motion' }); }
    }
    it.attentionScore = (it.committees?.SLSC?.flagged?3:0)+(it.committees?.JCSI?.flagged?3:0)+(it.breaks21DayRule===true?4:0)+((it.events?.length||0)?2:0);
  }

  const list = Array.from(items.values()).sort((a,b)=> (b.attentionScore - a.attentionScore) || (b.laidDate||'').localeCompare(a.laidDate||''));

  // Write outputs (always)
  await fs.writeFile(path.join(dataDir, 'instruments.json'), JSON.stringify(list, null, 2));
  await fs.writeFile(path.join(dataDir, 'affirmative-events.json'), JSON.stringify(calEvents.sort((a,b)=> (a.date||'').localeCompare(b.date||'')), null, 2));
  await fs.writeFile(path.join(dataDir, 'lunr-index.json'), JSON.stringify({docs}, null, 2));
  try{ await fs.access(path.join(dataDir,'archive.json')); }catch{ await fs.writeFile(path.join(dataDir,'archive.json'), JSON.stringify({ids:[]}, null, 2)); }

  const pick = (i)=> ({ id:i.id, title:i.title, laidDate:i.laidDate, department:i.department, procedure:i.procedure, status:i.status, commonsOnly:!!i.commonsOnly, breaks21DayRule:i.breaks21DayRule });
  await fs.mkdir(feedsDir, { recursive: true });
  await fs.writeFile(path.join(feedsDir,'newly-laid.json'), JSON.stringify(list.slice(0,50).map(pick), null, 2));
  await fs.writeFile(path.join(feedsDir,'affirmatives.json'), JSON.stringify(list.filter(i=> i.procedure?.scrutiny==='affirmative').map(pick), null, 2));
  await fs.writeFile(path.join(feedsDir,'breaches.json'), JSON.stringify(list.filter(i=> i.breaks21DayRule===true).map(pick), null, 2));

  await fs.writeFile(path.join(dataDir,'build.json'), JSON.stringify({when: new Date().toISOString(), count:list.length, schema:'v2.1-timeline', since:SINCE}, null, 2));
  console.log('V2.1 timeline build complete. Items:', list.length);
}

main().catch(async e=>{
  console.error('Build failed:', e.message||e);
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(path.join(dataDir,'instruments.json'), '[]');
  await fs.writeFile(path.join(dataDir,'affirmative-events.json'), '[]');
  await fs.writeFile(path.join(dataDir,'lunr-index.json'), '{"docs":[]}');
  await fs.writeFile(path.join(dataDir,'build.json'), JSON.stringify({when:new Date().toISOString(), error:String(e.message||e), schema:'v2.1-timeline', since:SINCE}, null, 2));
});
