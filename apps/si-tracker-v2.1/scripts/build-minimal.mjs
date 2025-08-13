// build-minimal.mjs — Bare-minimum builder to prove data exists
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..'); // apps/si-tracker-v2.1
const dataDir = path.join(appRoot, 'data');
const queriesDir = path.join(__dirname, 'queries');

const ENDPOINT = 'https://api.parliament.uk/sparql';
const SINCE = process.env.SI_SINCE || '2024-05-26'; // session start as safe default

async function sparql(query){
  const q = query.replace(/\?since\b/g, `"${SINCE}"^^<http://www.w3.org/2001/XMLSchema#date>`);
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
const val = (b)=> b?.value ?? null;

async function main(){
  await fs.mkdir(dataDir, { recursive: true });
  const q = await readQ('minimal.sparql');
  const rs = await sparql(q);

  // Map to minimal instruments.json the frontend can render
  const list = rs.results.bindings.map(b=> ({
    id: val(b.workPackage),
    si: val(b.SI),
    title: val(b.title),
    laidDate: val(b.date),
    links: {}
  }));

  // Sort newest first
  list.sort((a,b)=> (b.laidDate||'').localeCompare(a.laidDate||''));

  await fs.writeFile(path.join(dataDir,'instruments.json'), JSON.stringify(list, null, 2));
  await fs.writeFile(path.join(dataDir,'affirmative-events.json'), '[]'); // keep frontend happy
  const build = { when:new Date().toISOString(), schema:'v2.1-minimal', count:list.length, since:SINCE,
                  sample:list.slice(0,5) };
  await fs.writeFile(path.join(dataDir,'build.json'), JSON.stringify(build, null, 2));

  console.log('Minimal build complete. Items:', list.length);
}

main().catch(async e=>{
  console.error('Minimal build failed:', e.message||e);
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(path.join(dataDir,'instruments.json'), '[]');
  await fs.writeFile(path.join(dataDir,'affirmative-events.json'), '[]');
  await fs.writeFile(path.join(dataDir,'build.json'), JSON.stringify({when:new Date().toISOString(), schema:'v2.1-minimal', error:String(e.message||e), since:SINCE}, null, 2));
});
