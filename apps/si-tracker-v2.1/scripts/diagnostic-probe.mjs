// Minimal diagnostics probe for SI Tracker
import fs from 'fs';
import fetch from 'node-fetch';

const since = process.env.SI_SINCE || '2024-05-26';
const endpoint = 'https://lda.data.parliament.uk/sparql';

const minimalQuery = `
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX : <https://id.parliament.uk/schema/>
PREFIX id: <https://id.parliament.uk/>

SELECT ?SI ?SIname ?laidDate WHERE {
  ?SI a :StatutoryInstrumentPaper ;
      rdfs:label ?SIname ;
      :workPackagedThingHasWorkPackage ?wp .
  OPTIONAL {
    ?wp :workPackageHasBusinessItem ?bi .
    ?bi :businessItemDate ?laidDate .
  }
  FILTER(str(?laidDate) > '${since}')
}
ORDER BY DESC(?laidDate)
LIMIT 10
`;

async function run() {
  const probe = { since, status: null, rows: 0, sample: [] };
  try {
    const url = endpoint + '?query=' + encodeURIComponent(minimalQuery) + '&_format=json';
    const res = await fetch(url);
    probe.status = res.status;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const results = data.results.bindings.map(b => ({
      id: b.SI.value,
      title: b.SIname.value,
      laidDate: b.laidDate?.value || null
    }));
    probe.rows = results.length;
    probe.sample = results;
  } catch (err) {
    probe.error = err.message;
  }
  fs.writeFileSync('apps/si-tracker-v2.1/data/probe.json', JSON.stringify(probe, null, 2));
  const buildFile = {
    when: new Date().toISOString(),
    schema: 'v2.1-diagnostics',
    count: probe.rows,
    since,
    diagnostics: probe
  };
  fs.writeFileSync('apps/si-tracker-v2.1/data/build.json', JSON.stringify(buildFile, null, 2));
}
run();
