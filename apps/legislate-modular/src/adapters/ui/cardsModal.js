function $el(id){ return document.getElementById(id); }

export function createModal() {
  const root = $el('modal-root');
  const title = $el('modal-title');
  const body = $el('modal-body');
  const ok = $el('modal-ok');
  let resolver = null;

  ok.addEventListener('click', () => {
    close();
    if (resolver) resolver();
  });

  function open(opts) {
    title.textContent = opts.title || 'Notice';
    body.textContent = opts.body || '';
    root.style.display = 'flex';
    root.setAttribute('aria-hidden', 'false');
    ok.focus();
    return new Promise(res => { resolver = res; });
  }

  function close() {
    root.style.display = 'none';
    root.setAttribute('aria-hidden', 'true');
    resolver = null;
  }

  return { open, close };
}
