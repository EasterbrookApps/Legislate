// build-data.mjs (refined): maps human-readable procedure labels & attaches timeline
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

async function sparql(q){
  const q2 = q.replace(/\?since\b/g, `\"${SINCE}\"^^<http://www.w3.org/2001/XMLSchema#date>`);
  const res = await fetch(ENDPOINT, { method:'POST', headers:{ 'content-type':'application/sparql-query', 'accept':'application/sparql-results+json' }, body:q2 });
  if(!res.ok){
    const txt = await res.text().catch(()=>'');
    throw new Error(`SPARQL ${res.status}: ${txt.substring(0,200)}`);
  }
  return await res.json();
}
const readQ = (rel)=> fs.readFile(path.join(queriesDir, rel), 'utf8');
const v = (b)=> b?.value ?? null;

async function fetchHTML(url){
  try{ const r=await fetch(url,{headers:{accept:'text/html'}}); return r.ok? await r.text(): null; }catch{ return null; }
}
function stripHtml(html){ return (html||'').replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' '); }
function extractCIFs(text){
  if(!text) return []; const t=text.replace(/\s+/g,' ');
  const rx=/(come into force|coming into force)[^0-9]{0,40}(\d{1,2}\s+[A-Za-z]+\s+\d{4})/gi;
  const out=new Set(); let m; while((m=rx.exec(t))) out.add(norm(m[2])); return Array.from(out).filter(Boolean).sort();
}
const norm=(s)=>{ try{ const d=new Date(s); return isNaN(d)?null:d.toISOString().slice(0,10);}catch{return null;} };
const days=(a,b)=> Math.round((new Date(b+'T00:00:00Z') - new Date(a+'T00:00:00Z'))/86400000);
const breach21=(laid,cifs)=> (!laid||!cifs?.length)? null : days(laid, cifs[0])<21;

function pickLabel(uri, label){
  if(label) return label;
  if(!uri) return null;
  const s=String(uri); const m=s.match(/[^/]+$/); return m?m[0]:s;
}

async function main(){
  await fs.mkdir(dataDir,{recursive:true}); await fs.mkdir(feedsDir,{recursive:true});
  const [baseQ, committeesQ, jcsiQ, motionsQ, currentQ, commonsOnlyQ, stepsQ] = await Promise.all([
    readQ('base-sis.sparql'), readQ('committees.sparql'), readQ('jcsi.sparql'), readQ('motions.sparql'),
    readQ('currently-before.sparql'), readQ('commons-only.sparql'), readQ('procedure-steps-all.sparql')
  ]);
  const statusFiles = ['status/withdrawn.sparql','status/revoked.sparql','status/void.sparql','status/signed.sparql'];
  const statusQs = await Promise.all(statusFiles.map(f=> readQ(f)));

  const [base, committees, jcsi, motions, current, commonsOnly, steps, ...statusRs] = await Promise.all([
    sparql(baseQ), sparql(committeesQ), sparql(jcsiQ), sparql(motionsQ), sparql(currentQ), sparql(commonsOnlyQ), sparql(stepsQ),
    ...statusQs.map(s=> sparql(s))
  ]);

  const items = new Map();

  // Base
  for(const r of base.results.bindings){
    const id = v(r.workPackage); if(!id) continue;
    const o = items.get(id) || { id, events:[], committees:{}, status:'current', tags:[] };
    o.wp = id;
    o.title = v(r.title) || o.title || '';
    o.laidDate = v(r.laidDate) || o.laidDate || v(r.madeDate) || null; // prefer laidDate, fallback madeDate
    o.procedure = {
      kind: pickLabel(v(r.procedureKind), v(r.procedureKindLabel)),
      scrutiny: pickLabel(v(r.procedureScrutiny), v(r.procedureScrutinyLabel))
    };
    o.links = o.links || {};
    o.links.legislation = v(r.legislationURI) || o.links.legislation || null;
    o.department = v(r.departmentLabel) || o.department || null;
    items.set(id, o);
  }

  // Steps -> timeline
  const timelineByWp = new Map();
  for(const r of steps.results.bindings){
    const wp = v(r.workPackage); if(!wp) continue;
    const arr = timelineByWp.get(wp) || [];
    arr.push({ date: v(r.date)?.slice(0,10) || null, step: v(r.step), stepLabel: v(r.stepLabel) || pickLabel(v(r.step)), house: v(r.houseLabel)||null });
    timelineByWp.set(wp, arr);
  }

  // Attach timelines and derive laid date from explicit laid step if present
  const laidStepIds = new Set(['https://id.parliament.uk/cspzmb6w', 'https://id.parliament.uk/WkH5enjt']);
  for(const [id, o] of items){
    const tl = (timelineByWp.get(id) || []).sort((a,b)=> (a.date||'').localeCompare(b.date||''));
    o.timeline = tl;
    const laidEvent = tl.find(ev=> ev.step && (laidStepIds.has(ev.step) || /laid before the house/i.test(ev.stepLabel||'')));
    if(laidEvent?.date) o.laidDate = laidEvent.date;
  }

  // Other enrichments
  for(const r of committees.results.bindings){
    const id = v(r.workPackage); if(!id) continue;
    const o = items.get(id) || { id, events: [], committees: {}, status:'current', tags:[] };
    o.committees.SLSC = { ...(o.committees.SLSC||{}), flagged: true, report: v(r.slscReportURI) || null };
    items.set(id, o);
  }
  for(const r of jcsi.results.bindings){
    const id = v(r.workPackage); if(!id) continue;
    const o = items.get(id) || { id, events: [], committees: {}, status:'current', tags:[] };
    o.committees.JCSI = { ...(o.committees.JCSI||{}), flagged: true };
    items.set(id, o);
  }
  for(const r of motions.results.bindings){
    const id = v(r.workPackage); if(!id) continue;
    const o = items.get(id) || { id, events: [], committees: {}, status:'current', tags:[] };
    o.events.push({ date: v(r.date)?.slice(0,10) || null, house: v(r.houseLabel) || null, label: v(r.label) || 'Approval motion tabled', kind: 'motion' });
    items.set(id, o);
  }
  const statusNames = ['withdrawn','revoked','void','signed'];
  statusRs.forEach((res, idx)=>{
    for(const r of res.results.bindings){
      const id = v(r.workPackage); if(!id) continue;
      const o = items.get(id) || { id, events: [], committees: {}, status:'current', tags:[] };
      o.status = statusNames[idx]; items.set(id, o);
    }
  });
  const currentSet = new Set(current.results.bindings.map(r=> v(r.workPackage)).filter(Boolean));
  for(const [id, o] of items){ if(!currentSet.has(id) && o.status === 'current'){ o.status = o.status; } }
  const commonsSet = new Set(commonsOnly.results.bindings.map(r=> v(r.workPackage)).filter(Boolean));
  for(const id of commonsSet){ const o = items.get(id); if(o) o.commonsOnly = true; }

  // EM enrichment + 21-day rule
  const docs = []; const calEvents = [];
  for(const [id, it] of items){
    if(it.links?.legislation){
      const emURL = it.links.legislation.replace(/\/contents\/made.*/,'') + '/memorandum/contents';
      it.links.memorandum = emURL;
      const [emHTML, legHTML] = await Promise.all([fetchHTML(emURL), fetchHTML(it.links.legislation)]);
      const emText = stripHtml(emHTML);
      if(emText) it.emHtml = emHTML;
      const cifs = (legHTML? extractCIFs(legHTML): []);
      if(cifs.length) it.comesIntoForce = cifs;
      if((it.procedure?.kind||'').toLowerCase().includes('made') && (it.procedure?.scrutiny||'').toLowerCase().includes('negative')){
        it.breaks21DayRule = breach21(it.laidDate, cifs);
      } else it.breaks21DayRule = null;
      docs.push({ id, content: [it.title, emText || ''].join(' ') });
    }
    if((it.procedure?.scrutiny||'').toLowerCase() === 'affirmative'){
      for(const ev of (it.events||[])){ if(ev.date) calEvents.push({ date: ev.date, title: it.title, house: ev.house, kind: ev.kind||'motion' }); }
    }
    it.attentionScore = (it.committees?.SLSC?.flagged?3:0)+(it.committees?.JCSI?.flagged?3:0)+(it.breaks21DayRule===true?4:0)+((it.events?.length||0)?2:0);
  }

  const list = Array.from(items.values()).sort((a,b)=> (b.attentionScore - a.attentionScore) || (b.laidDate||'').localeCompare(a.laidDate||''));

  await fs.writeFile(path.join(dataDir,'instruments.json'), JSON.stringify(list,null,2));
  await fs.writeFile(path.join(dataDir,'affirmative-events.json'), JSON.stringify(calEvents.sort((a,b)=> (a.date||'').localeCompare(b.date||'')), null, 2));
  await fs.writeFile(path.join(dataDir,'lunr-index.json'), JSON.stringify({docs}, null, 2));
  try{ await fs.access(path.join(dataDir,'archive.json')); }catch{ await fs.writeFile(path.join(dataDir,'archive.json'), JSON.stringify({ids:[]}, null, 2)); }

  const pick = (i)=> ({ id:i.id, title:i.title, laidDate:i.laidDate, department:i.department, procedure:i.procedure, status:i.status, commonsOnly:!!i.commonsOnly, breaks21DayRule:i.breaks21DayRule });
  await fs.mkdir(feedsDir,{recursive:true});
  await fs.writeFile(path.join(feedsDir,'newly-laid.json'), JSON.stringify(list.slice(0,50).map(pick), null, 2));
  await fs.writeFile(path.join(feedsDir,'affirmatives.json'), JSON.stringify(list.filter(i=> (i.procedure?.scrutiny||'').toLowerCase()==='affirmative').map(pick), null, 2));
  await fs.writeFile(path.join(feedsDir,'breaches.json'), JSON.stringify(list.filter(i=> i.breaks21DayRule===true).map(pick), null, 2));

  await fs.writeFile(path.join(dataDir,'build.json'), JSON.stringify({when:new Date().toISOString(), count:list.length, schema:'v2.1-fix2', since:SINCE}, null, 2));
  console.log('V2.1 fix2 build complete. Items:', list.length);
}

main().catch(async e=>{
  console.error('Build failed:', e.message||e);
  await fs.mkdir(dataDir,{recursive:true});
  await fs.writeFile(path.join(dataDir,'instruments.json'),'[]');
  await fs.writeFile(path.join(dataDir,'affirmative-events.json'),'[]');
  await fs.writeFile(path.join(dataDir,'lunr-index.json'),'{"docs":[]}');
  await fs.writeFile(path.join(dataDir,'build.json'), JSON.stringify({when:new Date().toISOString(), error:String(e.message||e), schema:'v2.1-fix2', since:SINCE}, null, 2));
});
