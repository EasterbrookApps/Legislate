// build-data.mjs — Align with Parliament laid steps; attach full timeline; exclude non‑laid / no‑procedure.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const dataDir = path.join(appRoot, 'data');
const feedsDir = path.join(appRoot, 'feeds');
const queriesDir = path.join(__dirname, 'queries');

const ENDPOINT = 'https://api.parliament.uk/sparql';
const SINCE = process.env.SI_SINCE || '2024-07-04'; // election date default

function injectSince(q){
  return q.replace(/\?since\b/g, `"${SINCE}"^^<http://www.w3.org/2001/XMLSchema#date>`);
}

async function runQuery(text){
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type':'application/sparql-query', 'accept':'application/sparql-results+json' },
    body: injectSince(text)
  });
  if(!res.ok){
    const t = await res.text().catch(()=>'');
    throw new Error(`SPARQL ${res.status}: ${t.substring(0,300)}`);
  }
  return res.json();
}

const readQ = (rel)=> fs.readFile(path.join(queriesDir, rel), 'utf8');
const v = (b)=> b?.value ?? null;

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

  // Load queries
  const [
    baseQ, timelineQ,
    committeesQ, jcsiQ, motionsQ, currentQ, commonsOnlyQ,
    withdrawnQ, revokedQ, voidQ, signedQ
  ] = await Promise.all([
    readQ('base-sis.sparql'),
    readQ('procedure-steps-all.sparql'),
    readQ('committees.sparql').catch(()=>''),
    readQ('jcsi.sparql').catch(()=>''),
    readQ('motions.sparql').catch(()=>''),
    readQ('currently-before.sparql').catch(()=>''),
    readQ('commons-only.sparql').catch(()=>''),
    readQ('status/withdrawn.sparql').catch(()=>''),
    readQ('status/revoked.sparql').catch(()=>''),
    readQ('status/void.sparql').catch(()=>''),
    readQ('status/signed.sparql').catch(()=>''),
  ]);

  // Execute main & timeline first
  const [baseR, timelineR] = await Promise.all([ runQuery(baseQ), runQuery(timelineQ) ]);

  // Build index
  const items = new Map();
  for(const r of baseR.results.bindings){
    const id = v(r.workPackage); if(!id) continue;
    const o = items.get(id) || { id, events: [], committees: {}, status:'current', tags:[] };
    o.si = v(r.SI);
    o.title = v(r.title) || o.title || '';
    o.laidDate = (v(r.laidDate)||'').slice(0,10) || o.laidDate || null;
    o.links = o.links || {};
    o.links.legislation = v(r.legislationURI) || o.links.legislation || null;
    o.madeDate = (v(r.madeDate)||'').slice(0,10) || null;
    o.comesIntoForce = v(r.comesIntoForceDate) ? [ (v(r.comesIntoForceDate)||'').slice(0,10) ] : o.comesIntoForce;
    o.comesIntoForceNote = v(r.comesIntoForceNote) || null;
    o.department = v(r.departmentLabel) || o.department || null;
    o.procedure = {
      kindLabel: v(r.procedureKindLabel) || null,
      scrutinyLabel: v(r.procedureScrutinyLabel) || null
    };
    // Fallback: if laidDate missing, use madeDate
    if(!o.laidDate && o.madeDate) o.laidDate = o.madeDate;
    items.set(id, o);
  }

  // Attach timeline
  const tlByWP = new Map();
  for(const r of timelineR.results.bindings){
    const id = v(r.workPackage); if(!id) continue;
    const entry = {
      date: (v(r.biDate)||'').slice(0,10) || null,
      step: v(r.step) || null,
      stepLabel: v(r.stepLabel) || null,
      house: v(r.houseLabel) || null
    };
    const arr = tlByWP.get(id) || [];
    arr.push(entry);
    tlByWP.set(id, arr);
  }
  for(const [id, arr] of tlByWP){
    const o = items.get(id); if(!o) continue;
    o.timeline = arr.sort((a,b)=> (a.date||'').localeCompare(b.date||''));
  }

  // Filter: ensure we only keep items that are laid && have a procedure
  for(const [id,o] of Array.from(items.entries())){
    const hasLaid = !!o.laidDate;
    const hasProc = !!(o.procedure && (o.procedure.kindLabel || o.procedure.scrutinyLabel));
    if(!hasLaid || !hasProc){
      items.delete(id);
    }
  }

  // Optional enrichers if present
  const runners = [];
  if(committeesQ) runners.push(runQuery(committeesQ).then(R=>({R,key:'SLSC'})));
  if(jcsiQ)       runners.push(runQuery(jcsiQ).then(R=>({R,key:'JCSI'})));
  if(motionsQ)    runners.push(runQuery(motionsQ).then(R=>({R,key:'MOTION'})));
  if(currentQ)    runners.push(runQuery(currentQ).then(R=>({R,key:'CURRENT'})));
  if(commonsOnlyQ)runners.push(runQuery(commonsOnlyQ).then(R=>({R,key:'COMMONS'})));
  if(withdrawnQ)  runners.push(runQuery(withdrawnQ).then(R=>({R,key:'WITHDRAWN'})));
  if(revokedQ)    runners.push(runQuery(revokedQ).then(R=>({R,key:'REVOKED'})));
  if(voidQ)       runners.push(runQuery(voidQ).then(R=>({R,key:'VOID'})));
  if(signedQ)     runners.push(runQuery(signedQ).then(R=>({R,key:'SIGNED'})));

  const extras = await Promise.all(runners);
  for(const {R,key} of extras){
    if(!R) continue;
    for(const r of R.results.bindings){
      const id = v(r.workPackage); if(!id) continue;
      const o = items.get(id); if(!o) continue;
      if(key==='SLSC'){ o.committees.SLSC = { flagged:true, report: v(r.slscReportURI)||null }; }
      else if(key==='JCSI'){ o.committees.JCSI = { flagged:true }; }
      else if(key==='MOTION'){ (o.events=o.events||[]).push({ date:(v(r.date)||'').slice(0,10), house:v(r.houseLabel)||null, label:v(r.label)||'Motion', kind:'motion' }); }
      else if(key==='CURRENT'){ /* presence implies current; already default */ }
      else if(key==='COMMONS'){ o.commonsOnly = true; }
      else if(key==='WITHDRAWN'){ o.status='withdrawn'; }
      else if(key==='REVOKED'){ o.status='revoked'; }
      else if(key==='VOID'){ o.status='void'; }
      else if(key==='SIGNED'){ o.status='signed'; }
    }
  }

  // EM + 21-day check
  for(const [id, it] of items){
    if(it.links?.legislation){
      const emURL = it.links.legislation.replace(/\/contents\/made.*/,'') + '/memorandum/contents';
      it.links.memorandum = emURL;
      const [emHTML, legHTML] = await Promise.all([fetchHTML(emURL), fetchHTML(it.links.legislation)]);
      const emText = stripHtml(emHTML);
      if(emText) it.emHtml = emHTML;
      const cifs = extractCIFs(legHTML);
      if(cifs.length) it.comesIntoForce = cifs;
      // 21-day: made negatives (use laidDate vs first CIF date)
      const procK = (it.procedure?.kindLabel||'').toLowerCase();
      const procS = (it.procedure?.scrutinyLabel||'').toLowerCase();
      const isMadeNegative = procK.includes('made') && procS.includes('negative') || procS=='negative';
      if(isMadeNegative){
        it.breaks21DayRule = breach21(it.laidDate, it.comesIntoForce);
      } else it.breaks21DayRule = null;
    }
    // attention score
    it.attentionScore = (it.committees?.SLSC?.flagged?3:0)+(it.committees?.JCSI?.flagged?3:0)+(it.breaks21DayRule===true?4:0)+((it.events?.length||0)?2:0);
  }

  // Build list
  const list = Array.from(items.values()).sort((a,b)=> (b.attentionScore - a.attentionScore) || (b.laidDate||'').localeCompare(a.laidDate||''));

  // Calendar events from motions (affirmatives)
  const calEvents = [];
  for(const it of list){
    if((it.procedure?.scrutinyLabel||'').toLowerCase().includes('affirmative')){
      for(const ev of (it.events||[])){ if(ev.date) calEvents.push({ date:ev.date, title: it.title, house: ev.house, kind: ev.kind||'motion' }); }
    }
  }

  // Always write outputs
  await fs.writeFile(path.join(dataDir, 'instruments.json'), JSON.stringify(list, null, 2));
  await fs.writeFile(path.join(dataDir, 'affirmative-events.json'), JSON.stringify(calEvents.sort((a,b)=> (a.date||'').localeCompare(b.date||'')), null, 2));
  await fs.writeFile(path.join(dataDir, 'lunr-index.json'), JSON.stringify({docs: list.map(i=>({id:i.id, content: [i.title, stripHtml(i.emHtml||'')].join(' ')}))}, null, 2));
  try{ await fs.access(path.join(dataDir,'archive.json')); }catch{ await fs.writeFile(path.join(dataDir,'archive.json'), JSON.stringify({ids:[]}, null, 2)); }

  // Feeds
  const pick = (i)=> ({ id:i.id, title:i.title, laidDate:i.laidDate, department:i.department, procedure:{kind:i.procedure?.kindLabel||null, scrutiny:i.procedure?.scrutinyLabel||null}, status:i.status||'current', commonsOnly:!!i.commonsOnly, breaks21DayRule:i.breaks21DayRule });
  await fs.mkdir(feedsDir, { recursive: true });
  await fs.writeFile(path.join(feedsDir,'newly-laid.json'), JSON.stringify(list.slice(0,50).map(pick), null, 2));
  await fs.writeFile(path.join(feedsDir,'affirmatives.json'), JSON.stringify(list.filter(i=> (i.procedure?.scrutinyLabel||'').toLowerCase().includes('affirmative')).map(pick), null, 2));
  await fs.writeFile(path.join(feedsDir,'breaches.json'), JSON.stringify(list.filter(i=> i.breaks21DayRule===true).map(pick), null, 2));

  // Debug hints
  const debug = list.length===0 ? { since:SINCE, msg:"No items after laid-step filter; confirm step IDs && availability." } : undefined;
  await fs.writeFile(path.join(dataDir,'build.json'), JSON.stringify({when:new Date().toISOString(), count:list.length, schema:'v2.1-proc-timeline', since:SINCE, debug}, null, 2));
  console.log('Build complete. Items:', list.length);
}

main().catch(async e=>{
  console.error('Build failed:', e.message||e);
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(path.join(dataDir,'instruments.json'), '[]');
  await fs.writeFile(path.join(dataDir,'affirmative-events.json'), '[]');
  await fs.writeFile(path.join(dataDir,'lunr-index.json'), '{"docs":[]}');
  await fs.writeFile(path.join(dataDir,'build.json'), JSON.stringify({when:new Date().toISOString(), error:String(e.message||e), schema:'v2.1-proc-timeline', since:SINCE}, null, 2));
});
