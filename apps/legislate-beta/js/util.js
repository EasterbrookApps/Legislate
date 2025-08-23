export const DEBUG = (new URLSearchParams(location.search).get('debug') === '1');
export async function fetchJSON(path){
  const dev = DEBUG;
  const url = dev ? (path + (path.includes('?') ? '&' : '?') + 'c=' + Date.now()) : path;
  const res = await fetch(url, {cache: dev ? 'no-store' : 'default'});
  if(!res.ok) throw new Error('Fetch failed: '+path+' ['+res.status+']');
  return res.json();
}
export function $(sel, root){ return (root||document).querySelector(sel); }