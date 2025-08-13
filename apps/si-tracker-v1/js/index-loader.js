
(async ()=>{
  const res = await fetch('./data/lunr-index.json').catch(()=>null);
  if(res && res.ok){
    const data = await res.json();
    const script = document.createElement('script');
    script.src = './vendor/lunr.min.js';
    script.onload = ()=>{
      const idx = lunr(function(){
        this.ref('id'); this.field('content');
        (data.docs||[]).forEach(d=> this.add(d));
      });
      window.lunrIndex = idx;
    };
    document.head.appendChild(script);
  }
  // expose archive ids for client-side merge
  try{
    const arch = await fetch('./data/archive.json').then(r=>r.json());
    window.__archiveIds = arch.ids || [];
  }catch{}
})();
