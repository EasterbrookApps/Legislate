window.LegislateLoader=(function(){function withBase(p){return String(p||'');}
function cacheBusted(url){try{const u=new URL(url,location.href);u.searchParams.set('cb',String(Date.now()).slice(-6));return u.toString();}catch(e){return url+(url.includes('?')?'&':'?')+'cb='+String(Date.now()).slice(-6);}}
async function fetchJSON(url){const res=await fetch(cacheBusted(url),{cache:'no-store'});if(!res.ok)throw new Error(`HTTP ${res.status} for ${url}`);return await res.json();}
return {withBase,fetchJSON,cacheBusted};})();