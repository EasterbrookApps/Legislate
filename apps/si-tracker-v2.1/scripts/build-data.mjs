// build-data.mjs (DEBUG schema) — merges timeline; keeps records even if laid step missing
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
  const q = query.replace(/\?since\b/g, `\"${SINCE}\"^^<http://www.w3.org/2001/XMLSchema#date>`);
  const res = await fetch(ENDPOINT, {
    method:'POST',
    headers: { 'content-type':'application/sparql-query', 'accept':'application/sparql-results+json' },
    body: q
  });
  if(!res.ok){
    const txt = await res.text().catch(()=>'');
    throw new Error(`SPARQL ${res.status}: ${txt.substring(0,200)}`);
  }
  return await res.json();
}
const readQ = (rel)=> fs.readFile(path.join(queriesDir, rel), 'utf8');
const v = (b)=> b?.value ?? null;

async function main(){
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(feedsDir, { recursive: true });

  const [baseQ, stepsQ] = await Promise.all([
    readQ('base-sis.sparql'), readQ('procedure-steps-all.sparql')
  ]);

  const [base, steps] = await Promise.all([ sparql(baseQ), sparql(stepsQ) ]);

  // Map timelines by workPackage
  const timelines = new Map();
  for(const r of steps.results.bindings){
    const wp = v(r.workPackage); if(!wp) continue;
    const arr = timelines.get(wp) || [];
    arr.push({
      date: v(r.biDate)?.slice(0,10) || null,
      step: v(r.step) || null,
      stepLabel: v(r.stepLabel) || null,
      house: v(r.houseLabel) || null
    });
    timelines.set(wp, arr);
  }
  for(const [wp, arr] of timelines){
    arr.sort((a,b)=> (a.date||'').localeCompare(b.date||''));
  }

  // Build item list (loosened filters)
  const items = new Map();
  for(const r of base.results.bindings){
    const id = v(r.workPackage); if(!id) continue;
    const laidC = v(r.laidDateCommons);
    const laidL = v(r.laidDateLords);
    const laid = (laidC || laidL || null);
    const procKindLabel = v(r.procedureKindLabel);
    const procScrLabel = v(r.procedureScrutinyLabel);
    const dept = v(r.departmentLabel);

    const o = items.get(id) || { id, events: [], committees: {}, status:'current', tags:[] };
    o.si = v(r.SI) || o.si || null;
    o.title = v(r.title) || o.title || '';
    o.laidDate = laid ? laid.slice(0,10) : (v(r.madeDate)?.slice(0,10) || null);
    o.links = o.links || {};
    o.links.legislation = v(r.legislationURI) || o.links.legislation || null;

    o.procedure = { kindLabel: procKindLabel || null, scrutinyLabel: procScrLabel || null };
    o.department = dept || o.department || null;

    // attach timeline (if any)
    const tl = timelines.get(id);
    if(tl) o.timeline = tl;

    items.set(id, o);
  }

  // Convert to array
  const list = Array.from(items.values());

  // Debug sample
  const sample = list.slice(0,5).map(x=> ({
    id: x.id,
    title: x.title,
    laidDate: x.laidDate,
    dept: x.department,
    proc: x.procedure,
    hasTimeline: Array.isArray(x.timeline) && x.timeline.length>0
  }));

  // Write outputs
  await fs.writeFile(path.join(dataDir, 'instruments.json'), JSON.stringify(list, null, 2));
  await fs.writeFile(path.join(dataDir, 'affirmative-events.json'), '[]');
  await fs.writeFile(path.join(dataDir, 'lunr-index.json'), '{"docs":[]}');
  await fs.writeFile(path.join(dataDir,'build.json'), JSON.stringify({when:new Date().toISOString(), count:list.length, schema:'v2.1-backend-debug', since:SINCE, debug:{sample}}, null, 2));

  console.log('DEBUG build complete. Items:', list.length);
}

main().catch(async e=>{
  console.error('Build failed:', e.message||e);
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(path.join(dataDir,'instruments.json'), '[]');
  await fs.writeFile(path.join(dataDir,'affirmative-events.json'), '[]');
  await fs.writeFile(path.join(dataDir,'lunr-index.json'), '{"docs":[]}');
  await fs.writeFile(path.join(dataDir,'build.json'), JSON.stringify({when:new Date().toISOString(), error:String(e.message||e), schema:'v2.1-backend-debug', since:SINCE}, null, 2));
});
