// ui-editor-link.js — v1.4.1
(function(){
  function addLink(){
    const admin = document.getElementById('admin-panel') || document.querySelector('.admin') || document.body;
    const wrap = document.createElement('div');
    wrap.style.position='fixed'; wrap.style.bottom='10px'; wrap.style.right='10px'; wrap.style.zIndex='2000';
    wrap.style.fontFamily='var(--ui-font-body, system-ui)';
    wrap.innerHTML = '<a href="editor/index.html" target="_blank" style="background:#111;color:#fff;padding:8px 10px;border-radius:8px;text-decoration:none;margin-right:8px">Open UI Editor</a>' +
                     '<span style="background:#f0f0f0;color:#111;padding:6px 8px;border-radius:8px;border:1px solid #ddd;">v1.4.1</span>';
    document.body.appendChild(wrap);
  }
  window.addEventListener('DOMContentLoaded', addLink);
})();
