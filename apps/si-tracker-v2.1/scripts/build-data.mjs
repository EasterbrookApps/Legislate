// build-data.mjs — backend fix: laid-only with procedure, labels, full timeline merge + debug
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..'); // apps/si-tracker-v2.1
const dataDir = path.join(appRoot, 'data');
const feedsDir = path.join(appRoot, 'feeds');
const queriesDir = path.join(__dirname, 'queries');

const ENDPOINT = 'https://api.parliament.uk/sparql';
const SINCE = process.env.SI_SINCE || '2024-07-04'; // last election default

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

function toISO(d){ try{ return d? new Date(d).toISOString().slice(0,10): null; }catch{ return null; } }

async function main(){
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(feedsDir, { recursive: true });

  const [baseQ, stepsQ, committeesQ, jcsiQ, motionsQ, currentQ, commonsOnlyQ] = await Promise.all([
    readQ('base-sis.sparql'),
    readQ('procedure-steps-all.sparql'),
    readQ('committees.sparql').catch(()=>''),
    readQ('jcsi.sparql').catch(()=>''),
    readQ('motions.sparql').catch(()=>''),
    readQ('currently-before.sparql').catch(()=>''),
    readQ('commons-only.sparql').catch(()=>''),
  ]);

  const [base, steps, committees, jcsi, motions, current, commonsOnly] = await Promise.all([
    sparql(baseQ), sparql(stepsQ),
    committeesQ? sparql(committeesQ): Promise.resolve({results:{bindings:[]}}),
    jcsiQ? sparql(jcsiQ): Promise.resolve({results:{bindings:[]}}),
    motionsQ? sparql(motionsQ): Promise.resolve({results:{bindings:[]}}),
    currentQ? sparql(currentQ): Promise.resolve({results:{bindings:[]}}),
    commonsOnlyQ? sparql(commonsOnlyQ): Promise.resolve({results:{bindings:[]}}),
  ]);

  // Build map from base
  const items = new Map();
  for(const r of base.results.bindings){
    const id = val(r.workPackage); if(!id) continue;
    const o = items.get(id) || { id, events: [], committees: {}, status: 'current', tags: [] };
    o.si = val(r.SI) || o.si || null;
    o.title = val(r.title) || o.title || '';
    o.laidDate = toISO(val(r.laidDate)) || o.laidDate || null;
    o.links = o.links || {}; o.links.legislation = val(r.legislationURI) || o.links.legislation || null;
    o.department = val(r.departmentLabel) || o.department || null;
    o.procedure = {
      kindLabel: val(r.procedureKindLabel) || o.procedure?.kindLabel || null,
      scrutinyLabel: val(r.procedureScrutinyLabel) || o.procedure?.scrutinyLabel || null,
    };
    o.madeDate = toISO(val(r.madeDate)) || o.madeDate || null;
    o.comesIntoForce = val(r.comesIntoForceDate) ? [toISO(val(r.comesIntoForceDate))] : (o.comesIntoForce||[]);
    if(val(r.comesIntoForceNote)){ o.cifNote = val(r.comesIntoForceNote); }
    items.set(id, o);
  }

  // Merge procedure steps into timeline
  for(const r of steps.results.bindings){
    const id = val(r.workPackage); if(!id) continue;
    if(!items.has(id)) continue; // only merge for laid+procedure SIs
    const o = items.get(id);
    o.timeline = o.timeline || [];
    o.timeline.push({
      date: toISO(val(r.biDate)),
      step: val(r.step),
      stepLabel: val(r.stepLabel) || null,
      house: val(r.houseLabel) || null,
    });
  }

  // Committee flags
  for(const r of committees.results.bindings){
    const id = val(r.workPackage); if(!id) continue;
    const o = items.get(id); if(!o) continue;
    o.committees.SLSC = { ...(o.committees.SLSC||{}), flagged: true, report: val(r.slscReportURI) || null };
  }
  for(const r of jcsi.results.bindings){
    const id = val(r.workPackage); if(!id) continue;
    const o = items.get(id); if(!o) continue;
    o.committees.JCSI = { ...(o.committees.JCSI||{}), flagged: true };
  }

  // Motions (keep as events for calendar)
  for(const r of motions.results.bindings){
    const id = val(r.workPackage); if(!id) continue;
    const o = items.get(id); if(!o) continue;
    o.events.push({ date: toISO(val(r.date)), house: val(r.houseLabel)||null, label: val(r.label)||'Approval motion tabled', kind: 'motion' });
  }

  // Commons-only
  const commonsSet = new Set((commonsOnly?.results?.bindings||[]).map(r=> val(r.workPackage)).filter(Boolean));
  for(const id of commonsSet){ const o = items.get(id); if(o) o.commonsOnly = true; }

  // Derive attention & 21-day
  for(const [id, it] of items){
    if(!it.laidDate && it.madeDate){ it.laidDate = it.madeDate; } // last resort
    // 21-day (only for made negatives). Use CIF if present.
    if((it.procedure?.scrutinyLabel||'').toLowerCase().includes('negative') && it.madeDate && (it.comesIntoForce?.length)){
      const made = it.madeDate; const cif = it.comesIntoForce[0];
      const days = Math.round((new Date(cif+'T00:00:00Z') - new Date(made+'T00:00:00Z'))/86400000);
      it.breaks21DayRule = (days < 21);
    } else it.breaks21DayRule = null;

    it.attentionScore = (it.committees?.SLSC?.flagged?3:0)+(it.committees?.JCSI?.flagged?3:0)+(it.breaks21DayRule===true?4:0)+((it.events?.length||0)?2:0);
  }

  const list = Array.from(items.values())
    .filter(it=> it.laidDate) // ensure laid
    .sort((a,b)=> (b.attentionScore - a.attentionScore) || (b.laidDate||'').localeCompare(a.laidDate||''));

  // Calendar events (affirmatives only)
  const calEvents = list
    .filter(i=> (i.procedure?.scrutinyLabel||'').toLowerCase().includes('affirmative'))
    .flatMap(i=> (i.events||[]).filter(e=> e.date).map(e=> ({date:e.date, title:i.title, house:e.house, kind:e.kind||'motion'})))
    .sort((a,b)=> (a.date||'').localeCompare(b.date||''));

  // Debug sample dates if missing fields
  const debug = {};
  if(list.length === 0){
    debug.note = 'No items after laid+procedure filter';
  } else {
    debug.sample = list.slice(0,5).map(x=>({id:x.id, laidDate:x.laidDate, procedure:x.procedure}));
  }

  // Write outputs
  await fs.writeFile(path.join(dataDir, 'instruments.json'), JSON.stringify(list, null, 2));
  await fs.writeFile(path.join(dataDir, 'affirmative-events.json'), JSON.stringify(calEvents, null, 2));
  await fs.writeFile(path.join(dataDir, 'lunr-index.json'), '{"docs":[]}'); // index omitted in this patch
  try{ await fs.access(path.join(dataDir,'archive.json')); }catch{ await fs.writeFile(path.join(dataDir,'archive.json'), JSON.stringify({ids:[]}, null, 2)); }
  await fs.mkdir(feedsDir, { recursive: true });
  await fs.writeFile(path.join(feedsDir,'newly-laid.json'), JSON.stringify(list.slice(0,50).map(i=>({id:i.id,title:i.title,laidDate:i.laidDate,department:i.department,procedure:i.procedure,status:i.status,commonsOnly:!!i.commonsOnly,breaks21DayRule:i.breaks21DayRule})), null, 2));

  await fs.writeFile(path.join(dataDir,'build.json'), JSON.stringify({when:new Date().toISOString(), count:list.length, schema:'v2.1-backend-fix', since:SINCE, debug}, null, 2));
  console.log('Backend fix build complete. Items:', list.length);
}

main().catch(async e=>{
  console.error('Build failed:', e.message||e);
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(path.join(dataDir,'instruments.json'), '[]');
  await fs.writeFile(path.join(dataDir,'affirmative-events.json'), '[]');
  await fs.writeFile(path.join(dataDir,'lunr-index.json'), '{"docs":[]}');
  await fs.writeFile(path.join(dataDir,'build.json'), JSON.stringify({when:new Date().toISOString(), error:String(e.message||e), schema:'v2.1-backend-fix', since:SINCE}, null, 2));
});
