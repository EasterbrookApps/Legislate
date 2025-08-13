// Diagnostics probe with User-Agent header
import fs from 'node:fs';

const since = process.env.SI_SINCE || '2024-05-26';
const endpoint = 'https://lda.data.parliament.uk/sparql';

const minimalQuery = `
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX : <https://id.parliament.uk/schema/>
SELECT ?SI ?SIname ?laidDate WHERE {
  ?SI a :StatutoryInstrumentPaper ;
      rdfs:label ?SIname ;
      :workPackagedThingHasWorkPackage ?wp .
  OPTIONAL {
    ?wp :workPackageHasBusinessItem ?bi .
    ?bi :businessItemDate ?laidDate .
  }
  FILTER(STR(?laidDate) >= "${since}" && STR(?laidDate) <= STR(NOW()))
}
ORDER BY DESC(?laidDate)
LIMIT 10
`;

async function run() {
  const probe = { since, status: null, rows: 0, sample: [], url: endpoint };
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/sparql-query',
        'accept': 'application/sparql-results+json',
        'user-agent': 'Mozilla/5.0 (compatible; SI-Tracker/1.0; +https://easterbrookapps.github.io)'
      },
      body: minimalQuery
    });
    probe.status = res.status;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const results = (data.results?.bindings || []).map(b => ({
      id: b.SI?.value || null,
      title: b.SIname?.value || null,
      laidDate: b.laidDate?.value || null
    }));
    probe.rows = results.length;
    probe.sample = results;
  } catch (err) {
    probe.error = err.message || String(err);
  }
  fs.mkdirSync('apps/si-tracker-v2.1/data', { recursive: true });
  fs.writeFileSync('apps/si-tracker-v2.1/data/probe.json', JSON.stringify(probe, null, 2));
  const buildFile = {
    when: new Date().toISOString(),
    schema: 'v2.1-diagnostics-UA',
    count: probe.rows,
    since,
    diagnostics: probe
  };
  fs.writeFileSync('apps/si-tracker-v2.1/data/build.json', JSON.stringify(buildFile, null, 2));
}
run();
