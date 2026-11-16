import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
function harness() {
  const values = new Map(), writes = [], calls = [];
  const source = readFileSync(new URL('../src/js/17b-screen-explorer.js', import.meta.url),'utf8').split('class OnlineBeatmapProvider')[0];
  const ctx = vm.createContext({navigator:{onLine:true},URLSearchParams,Date,Set,DB:{async kvGet(k){return values.get(k);},async kvSet(k,v){writes.push(k);values.set(k,v);}}});
  vm.runInContext(source+';globalThis.online=OnlineBeatmaps',ctx);
  const online=ctx.online;online.checkApi=async()=>true;online.normalize=x=>x;
  online.api=async path=>{calls.push(path);return {beatmapsets:[{id:1,diffs:[{keys:4,stars:3}]}],cursor_string:'next',total:100};};
  return {ctx,online,values,writes,calls};
}
test('default first result page survives reload and works offline without another request',async()=>{
  const h=harness();await h.online.search({});assert.equal(h.writes.length,1);assert.equal(h.calls.length,1);
  h.ctx.navigator.onLine=false;const cached=await h.online.search({});
  assert.equal(cached.sets[0].id,1);assert.equal(cached.cursor,'next');assert.equal(h.calls.length,1);
  assert.equal(h.online._savedCoverIds.has(1),true);
});
test('searches, filters and later pages do not replace the saved default page',async()=>{
  const h=harness();await h.online.search({});const saved=h.values.get('explorer.defaultPage.v1');
  for(const p of [{q:'song'},{cursor:'next'},{keys:[4]},{sort:'plays_desc'},{nsfw:false}])await h.online.search(p);
  assert.equal(h.writes.length,1);assert.equal(h.values.get('explorer.defaultPage.v1'),saved);assert.equal(h.calls.length,6);
});

test('only the saved default page writes artwork to the device cache',async()=>{
  const h=harness(), puts=[];
  h.online._savedCoverIds=new Set([1]);
  h.ctx.caches={async open(){return {async match(){return null;},async put(url){puts.push(url);},async keys(){return [];}};}};
  h.ctx.fetch=async()=>({ok:true});
  await h.online.saveDefaultCover(2,'https://covers.test/2.jpg');
  await h.online.saveDefaultCover(1,'https://covers.test/1.jpg');
  assert.deepEqual(puts,['https://covers.test/1.jpg']);
});

test('service worker serves saved explorer cover art offline and fetches uncached art normally',async()=>{
  const listeners={},saved={type:'opaque'},requests=[];
  const ctx=vm.createContext({URL,self:{location:{origin:'https://game.test'},addEventListener(t,fn){listeners[t]=fn;}},
    caches:{async open(name){assert.ok(['am-explorer-covers-v1','am-weekly-covers-v1'].includes(name));return {async match(req){return (name==='am-explorer-covers-v1' && req.url.endsWith('/saved.jpg')) || (name==='am-weekly-covers-v1' && req.url.endsWith('/weekly.jpg'))?saved:null;}};}},
    fetch:async req=>{requests.push(req.url);return {network:true};}});
  vm.runInContext(readFileSync(new URL('../src/sw.js',import.meta.url),'utf8'),ctx);
  async function request(file){let response;listeners.fetch({request:{method:'GET',headers:{has:()=>false},url:'https://covers.test/'+file,destination:'image'},respondWith(p){response=p;}});return await response;}
  assert.equal(await request('saved.jpg'),saved);assert.equal(await request('weekly.jpg'),saved);assert.equal(requests.length,0);
  assert.equal((await request('new.jpg')).network,true);assert.equal(requests.length,1);
});
