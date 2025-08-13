// diagnostic-probe.mjs
import fs from 'fs/promises';
import fetch from 'node-fetch';

const query = `SELECT * WHERE { ?s ?p ?o } LIMIT 1`; // placeholder

async function runDiagnostics() {
  const res = await fetch("https://lda.data.parliament.uk/sparql", {
    method: "POST",
    headers: {
      "content-type": "application/sparql-query",
      "accept": "application/sparql-results+json",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
      "origin": "https://ukparliament.github.io",
      "referer": "https://ukparliament.github.io/",
      "cache-control": "no-cache",
      "pragma": "no-cache"
    },
    body: query
  });
  const status = res.status;
  let json = {};
  try {
    json = await res.json();
  } catch(e) {}
  const diagnostics = {
    status,
    rows: json?.results?.bindings?.length || 0,
    sample: json?.results?.bindings?.slice(0, 5) || []
  };
  await fs.writeFile("../data/probe.json", JSON.stringify(diagnostics, null, 2));
}

runDiagnostics();
