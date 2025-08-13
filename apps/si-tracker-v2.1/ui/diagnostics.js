async function loadDiagnostics() {
  const files = [
    '../data/build.json',
    '../data/instruments.json',
    '../data/probe.json'
  ];
  let html = '';
  for (const file of files) {
    try {
      const res = await fetch(file + '?t=' + Date.now());
      if (!res.ok) throw new Error(res.status);
      const text = await res.text();
      html += `<h2>${file}</h2><pre>${text}</pre>`;
    } catch (err) {
      html += `<h2>${file}</h2><p style="color:red">Error: ${err.message}</p>`;
    }
  }
  document.getElementById('output').innerHTML = html;
}
loadDiagnostics();
