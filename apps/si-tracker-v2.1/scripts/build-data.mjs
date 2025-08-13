// build-data.mjs — keeps browser-like headers and clears stale outputs
import fs from 'fs/promises';
import path from 'path';
import fetch from 'node-fetch';

const since = process.env.SI_SINCE || "2024-07-04";
const today = new Date().toISOString().split("T")[0];

async function fetchData(query) {
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
  return res.json();
}

async function build() {
  const dataDir = path.resolve('./apps/si-tracker-v2.1/data');
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(path.join(dataDir, "instruments.json"), "[]"); // clear stale

  // placeholder simple query (replace with real once diagnostic passes 200)
  const query = `SELECT * WHERE { ?s ?p ?o } LIMIT 10`;
  const json = await fetchData(query);
  const items = json?.results?.bindings || [];

  await fs.writeFile(path.join(dataDir, "instruments.json"), JSON.stringify(items, null, 2));
  const buildInfo = { when: new Date().toISOString(), schema: "v2.1-full-browser-headers", count: items.length, since, today };
  await fs.writeFile(path.join(dataDir, "build.json"), JSON.stringify(buildInfo, null, 2));
}
build();
