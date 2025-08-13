// build-data.mjs — add User-Agent, enforce date window, clear stale outputs first
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const dataDir = path.join(appRoot, 'data');
const feedsDir = path.join(appRoot, 'feeds');
const queriesDir = path.join(__dirname, 'queries');

const ENDPOINT = 'https://lda.data.parliament.uk/sparql';
const SINCE = process.env.SI_SINCE || '2024-07-04';
const NOW_ISO = new Date().toISOString().slice(0,10);

const q = (s)=> s
  .replace(/\?since\b/g, `"${SINCE}"^^<http://www.w3.org/2001/XMLSchema#date>`)
  .replace(/\?today\b/g, `"${NOW_ISO}"^^<http://www.w3.org/2001/XMLSchema#date>`);

async function sparql(query){
  const res = await fetch(ENDPOINT, {
    method:'POST',
    headers: {
      'content-type':'application/sparql-query',
      'accept':'application/sparql-results+json',
      'user-agent':'Mozilla/5.0 (compatible; SI-Tracker/1.0; +https://easterbrookapps.github.io)'
    },
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
  try { return new Date(d).toISOString().slice(0,10); } catch { return String(d).slice(0,10); }
}
function withinWindow(d){
  if(!d) return false;
  return (d >= SINCE && d <= NOW_ISO);
}

async function main(){
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(feedsDir, { recursive: true });

  // Clear stale outputs up-front
  await fs.writeFile(path.join(dataDir, 'instruments.json'), '[]');
  await fs.writeFile(path.join(dataDir, 'affirmative-events.json'), '[]');
  await fs.writeFile(path.join(dataDir, 'lunr-index.json'), '{"docs":[]}');

  const [baseQ, stepsQ] = await Promise.all([
    readQ('base-sis.sparql'), readQ('procedure-steps-all.sparql')
  ]);
  const [base, steps] = await Promise.all([ sparql(q(baseQ)), sparql(q(stepsQ)) ]);

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
      links: { legislation: val(r.legislationURI) || val(r.link) || null },
      department: val(r.departmentLabel) || null,
      procedure: {
        kindLabel: val(r.procedureKindLabel) || null,
        scrutinyLabel: val(r.procedureScrutinyLabel) || null
      },
      timeline: tl.get(id) || []
    };
    if((obj.procedure.kindLabel || obj.procedure.scrutinyLabel) && obj.laidDate && withinWindow(obj.laidDate)){
      items.set(id, obj);
    }
  }

  const list = Array.from(items.values()).sort((a,b)=> (b.laidDate||'').localeCompare(a.laidDate||''));
  await fs.writeFile(path.join(dataDir, 'instruments.json'), JSON.stringify(list, null, 2));

  const sample = list.slice(0,5).map(x=>({id:x.id, laidDate:x.laidDate, dept:x.department, proc:x.procedure, hasTimeline:(x.timeline?.length||0)>0}));
  await fs.writeFile(path.join(dataDir,'build.json'), JSON.stringify({
    when: new Date().toISOString(),
    schema: 'v2.1-build-UA',
    count: list.length,
    since: SINCE,
    today: NOW_ISO,
    debug: { sample }
  }, null, 2));
}

main().catch(async e=>{
  await fs.writeFile(path.join(dataDir,'build.json'), JSON.stringify({
    when: new Date().toISOString(),
    schema: 'v2.1-build-UA',
    error: String(e.message||e),
    since: SINCE
  }, null, 2));
});
