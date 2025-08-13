// build-data.mjs — fixed date bounds, TZ normalization, sensible link harvesting
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..'); // apps/si-tracker-v2.1
const dataDir = path.join(appRoot, 'data');
const feedsDir = path.join(appRoot, 'feeds');
const queriesDir = path.join(__dirname, 'queries');

const ENDPOINT = 'https://lda.data.parliament.uk/sparql';
const SINCE = process.env.SI_SINCE || '2024-07-04'; // election
const NOW_ISO = new Date().toISOString().slice(0,10);

const q = (s)=> s
  .replace(/\?since\b/g, `"${SINCE}"^^<http://www.w3.org/2001/XMLSchema#date>`)
  .replace(/\?today\b/g, `"${NOW_ISO}"^^<http://www.w3.org/2001/XMLSchema#date>`);

async function sparql(query){
  const res = await fetch(ENDPOINT, {
    method:'POST',
    headers: { 'content-type':'application/sparql-query', 'accept':'application/sparql-results+json' },
    body: query
  });
  if(!res.ok){
    const txt = await res.text().catch(()=>'');
    throw new Error(`SPARQL ${res.status}: ${txt.substring(0,240)}`);
  }
  return await res.json();
}

const readQ = (rel)=> fs.readFile(path.join(queriesDir, rel), 'utf8');
const val = (b)=> b?.value ?? null;

function normDate(d){
  if(!d) return null;
  try {
    const iso = new Date(d).toISOString();
    return iso.slice(0,10);
  } catch { return String(d).slice(0,10); }
}

function withinWindow(d){
  if(!d) return false;
  const s = SINCE, t = NOW_ISO;
  return (d >= s && d <= t);
}

async function main(){
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(feedsDir, { recursive: true });

  const [baseQ, stepsQ] = await Promise.all([
    readQ('base-sis.sparql'), readQ('procedure-steps-all.sparql')
  ]);

  const [base, steps] = await Promise.all([
    sparql(q(baseQ)), sparql(q(stepsQ))
  ]);

  const tl = new Map();
  for(const b of steps.results.bindings){
    const wp = val(b.workPackage); if(!wp) continue;
    const arr = tl.get(wp) || [];
    arr.push({
      date: normDate(val(b.biDate)),
      stepLabel: val(b.stepLabel) || val(b.step) || 'Step',
      house: val(b.houseLabel) || null
    });
    tl.set(wp, arr);
  }

  const items = new Map();
  for(const r of base.results.bindings){
    const id = val(r.workPackage); if(!id) continue;
    const laid = normDate(val(r.laidDate) || val(r.laidDateCommons) || val(r.laidDateLords) || val(r.anyDate));
    const made = normDate(val(r.madeDate));
    const obj = {
      id,
      si: val(r.SI) || null,
      title: val(r.SIname) || val(r.title) || '',
      laidDate: laid || made || null,
      links: {
        legislation: val(r.legislationURI) || val(r.link) || null
      },
      department: val(r.departmentLabel) || null,
      procedure: {
        kindLabel: val(r.procedureKindLabel) || null,
        scrutinyLabel: val(r.procedureScrutinyLabel) || null
      },
      timeline: tl.get(id) || []
    };
    if(obj.procedure && (obj.procedure.kindLabel || obj.procedure.scrutinyLabel)){
      if(obj.laidDate && withinWindow(obj.laidDate)){
        items.set(id, obj);
      }
    }
  }

  const list = Array.from(items.values()).sort((a,b)=> (b.laidDate||'').localeCompare(a.laidDate||''));

  await fs.writeFile(path.join(dataDir, 'instruments.json'), JSON.stringify(list, null, 2));
  await fs.writeFile(path.join(dataDir, 'affirmative-events.json'), JSON.stringify([], null, 2));
  await fs.writeFile(path.join(dataDir, 'lunr-index.json'), JSON.stringify({docs: list.map(x=>({id:x.id, content:x.title}))}, null, 2));

  const sample = list.slice(0,5).map(x=> ({
    id:x.id, laidDate:x.laidDate, dept:x.department, proc:x.procedure, hasTimeline: (x.timeline?.length||0)>0
  }));

  await fs.writeFile(path.join(dataDir,'build.json'), JSON.stringify({
    when: new Date().toISOString(),
    schema: 'v2.1-build-fixed',
    count: list.length,
    since: SINCE,
    today: NOW_ISO,
    debug: { sample }
  }, null, 2));
}

main().catch(async e=>{
  await fs.writeFile(path.join(dataDir,'build.json'), JSON.stringify({
    when: new Date().toISOString(),
    schema: 'v2.1-build-fixed',
    error: String(e.message||e),
    since: SINCE
  }, null, 2));
  await fs.writeFile(path.join(dataDir, 'instruments.json'), '[]');
  await fs.writeFile(path.join(dataDir, 'affirmative-events.json'), '[]');
  await fs.writeFile(path.join(dataDir, 'lunr-index.json'), '{"docs":[]}');
});
