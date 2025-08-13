(function(){
  const files = [
    { key:'build',       url:'../data/build.json' },
    { key:'probe',       url:'../data/probe.json' },
    { key:'instruments', url:'../data/instruments.json' },
  ];

  const el = (id)=> document.getElementById(id);

  async function fetchText(u){
    const res = await fetch(u + (u.includes('?')?'&':'?') + 't=' + Date.now(), { cache: 'no-store' });
    if(!res.ok) throw new Error('HTTP ' + res.status);
    return await res.text();
  }

  function setStatus(key, ok, note){
    const pill = el('status-' + key);
    pill.textContent = note || (ok ? 'OK' : 'Error');
    pill.classList.remove('ok','bad');
    pill.classList.add(ok?'ok':'bad');
  }

  async function loadOne({key, url}){
    const pre = el('pre-' + key);
    try{
      const txt = await fetchText(url);
      setStatus(key, true, '200');
      // Pretty-print if JSON
      try {
        const obj = JSON.parse(txt);
        pre.textContent = JSON.stringify(obj, null, 2);
      } catch {
        pre.textContent = txt;
      }
    }catch(err){
      setStatus(key, false, err.message || String(err));
      pre.textContent = 'Error: ' + (err.message || String(err));
    }
  }

  async function loadAll(){
    el('basePath').textContent = location.pathname.replace(/\/[^\/]*$/, '/ui/');
    await Promise.all(files.map(loadOne));
  }

  el('refresh').addEventListener('click', loadAll);
  loadAll();
})();