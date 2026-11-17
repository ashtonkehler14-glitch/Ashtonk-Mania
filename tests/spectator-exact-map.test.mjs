import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';
import { PresenceLogic } from '../worker/multiplayer.js';
function fixture() {
  const x=load(['00-util.js','19c-online.js']), c=x.__ctx;
  c.AbortController=AbortController;c.AbortSignal=AbortSignal;
  c.Settings={get:()=>false};c.RankedWatch={on:false};c.Host={api:p=>'https://game.test/'+p};
  const maps=new Map();c.BeatmapManager={maps,mapByHash:hash=>[...maps.values()].find(m=>m.hash===hash),getFile:async(id,path)=>new Blob([path])};
  c.ExplorerScreen={downloads:new Map(),download:async()=>{}};
  x.SpectatorScreen.paint=()=>{};x.Spectate.tryStart=()=>{};
  const checksum=x.md5Hex(new TextEncoder().encode('original bytes'));
  const play={head:{mapHash:'original-hash',checksum,onlineId:7,onlineSetId:99,title:'Song',version:'Hard'},ended:false};
  x.Spectate.cur=play;x.Spectate.target={id:'host'};
  return {...x,c,maps,play,checksum};
}
test('spectate never picks a different file through a reused ID or title',async()=>{
  const {Spectate,maps,play}=fixture();maps.set('wrong',{id:'wrong',hash:'modified',onlineId:7,title:'Song',version:'Hard',osuPath:'modified bytes',problems:[]});
  assert.equal(Spectate.findMap(play.head),null);assert.equal(await Spectate.verifyLocal(play.head),null);assert.equal(Spectate.canStart(),false);
});
test('raw-file checksum can verify a local map across differing local hash formats',async()=>{
  const {Spectate,maps,play}=fixture();maps.set('right',{id:'right',hash:'legacy-hash',onlineId:7,osuPath:'original bytes',problems:[]});
  assert.equal((await Spectate.verifyLocal(play.head)).id,'right');assert.equal(Spectate.findMap(play.head).id,'right');
});
test('online resolution uses the checksum and only trusts matching lookup results',async()=>{
  const {Spectate,c,play,checksum}=fixture();let url;
  c.fetch=async u=>{url=u;return Response.json({checksum,setId:42,beatmapId:8});};
  await Spectate.resolveMap();assert.ok(url.includes('checksum='+checksum));assert.ok(!url.includes('?id='));
  assert.equal(play.head.onlineId,8);assert.equal(play.head.onlineSetId,42);assert.equal(play.lookup.state,'exact');
});
test('not found and unrelated checksum results never offer a guessed set',async()=>{
  for(const response of [new Response('',{status:404}),Response.json({checksum:'b'.repeat(32),setId:42,beatmapId:8})]){
    const {Spectate,c,play}=fixture();c.fetch=async()=>response;let downloads=0;c.ExplorerScreen.download=async()=>downloads++;
    await Spectate.resolveMap();await Spectate.download();assert.equal(play.lookup.state,'missing');assert.equal(downloads,0);assert.equal(play.head.onlineSetId,99);
  }
});
test('a failed lookup can be retried, including after receiving previously unavailable file details',async()=>{
  const {Spectate,c,play,checksum}=fixture();delete play.head.checksum;
  await Spectate.resolveMap();assert.equal(play.lookup.state,'unavailable');
  play.head.checksum=checksum;c.fetch=async()=>new Response('',{status:503});await Spectate.resolveMap(play,true);assert.equal(play.lookup.state,'error');
  c.fetch=async()=>Response.json({checksum,setId:42,beatmapId:8});await Spectate.resolveMap(play,true);assert.equal(play.lookup.state,'exact');
});
test('a lookup finishing after a song switch cannot change the new play',async()=>{
  const {Spectate,c,play,checksum}=fixture();let release;c.fetch=()=>new Promise(r=>release=r);
  const pending=Spectate.resolveMap();await new Promise(r=>setTimeout(r,0));const next={head:{mapHash:'next'},ended:false};Spectate.cur=next;
  release(Response.json({checksum,setId:42,beatmapId:8}));await pending;assert.equal(play.head.onlineSetId,99);assert.equal(next.head.onlineSetId,undefined);
});
test('a downloaded newer revision with the same ID cannot start spectating',async()=>{
  const {Spectate,c,maps,play,checksum}=fixture();c.fetch=async()=>Response.json({checksum,setId:42,beatmapId:8});
  c.ExplorerScreen.download=async()=>maps.set('wrong',{id:'wrong',hash:'new-revision',onlineId:8,osuPath:'different bytes',problems:[]});
  await Spectate.download();assert.equal(play.lookup.state,'mismatch');assert.equal(Spectate.canStart(),false);
});
test('late checksum details keep the current play and its already streamed frames',()=>{
  const p=new PresenceLogic(()=>1000);p.join('host',{name:'Host'});p.join('viewer',{name:'Viewer'});p.message('viewer',{t:'watch',to:'host'});
  p.message('host',{t:'play',head:{mapHash:'original',keys:4}});p.message('host',{t:'frames',ev:[100,0,1],at:100});
  const sum='a'.repeat(32),out=p.message('host',{t:'playMap',mapHash:'original',checksum:sum});
  assert.equal(out[0].msg.t,'specMap');assert.equal(p.users.get('host').play.checksum,sum);assert.equal(p.users.get('host').ev.length,3);
  assert.deepEqual(p.message('host',{t:'playMap',mapHash:'old-play',checksum:'b'.repeat(32)}),[]);
});
