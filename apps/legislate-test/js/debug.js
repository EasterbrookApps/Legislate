// js/debug.js
// Feature-flagged debug panel. Add ?debug=1 to the page URL to enable.

window.LegislateDebug = (function () {
  const qs = new URLSearchParams(location.search);
  const ON = qs.get('debug') === '1';

  const api = {
    info(msg) { if (!ON) return; log('INFO', msg || '[debug enabled]'); },
    env() { if (!ON) return;
      log('ENV', {
        ua: navigator.userAgent,
        dpr: window.devicePixelRatio,
        vw: window.innerWidth,
        vh: window.innerHeight,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone
      });
    },
    dom(map) { if (!ON) return; log('DOM', map); },
    log(tag, payload) { if (!ON) return; log(tag, payload); }
  };

  if (!ON) return api;

  // panel UI
  const panel = document.createElement('div');
  panel.id = 'dbg-panel';
  Object.assign(panel.style, {
    position: 'fixed', bottom: '0', left: '0', right: '0',
    maxHeight: '35vh', overflow: 'auto',
    font: '12px/1.3 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    background: '#111', color: '#eee', borderTop: '1px solid #333', zIndex: 2000, padding: '6px 8px'
  });

  const bar = document.createElement('div');
  Object.assign(bar.style, { display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' });
  const title = document.createElement('strong'); title.textContent = 'Debug';
  const btnDownload = document.createElement('button'); btnDownload.textContent = 'Download log';
  const btnClear = document.createElement('button'); btnClear.textContent = 'Clear';
  const btnCollapse = document.createElement('button'); btnCollapse.textContent = 'Collapse';
  [btnDownload, btnClear, btnCollapse].forEach(b => Object.assign(b.style, { fontSize: '12px' }));
  bar.append(title, btnDownload, btnClear, btnCollapse);

  const pre = document.createElement('pre');
  pre.id = 'dbg-log';
  Object.assign(pre.style, { margin: 0, whiteSpace: 'pre-wrap' });

  panel.append(bar, pre);
  document.body.appendChild(panel);

  const logs = [];
  function ts() { return new Date().toISOString(); }
  function log(tag, payload) {
    const line = `[${ts()}] ${tag} ${payload != null ? JSON.stringify(payload) : ''}`;
    logs.push(line);
    pre.textContent += line + '\n';
    pre.scrollTop = pre.scrollHeight;
  }

  btnClear.onclick = () => { logs.length = 0; pre.textContent = ''; };
  btnDownload.onclick = () => {
    const blob = new Blob([logs.join('\n')], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'legislate-debug.log'; a.click();
  };
  let collapsed = false;
  btnCollapse.onclick = () => {
    collapsed = !collapsed;
    pre.style.display = collapsed ? 'none' : 'block';
    btnCollapse.textContent = collapsed ? 'Expand' : 'Collapse';
  };

  return api;
})();