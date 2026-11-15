import test from 'node:test';
import assert from 'node:assert/strict';
import { Matchmaker } from '../worker/multiplayer.js';
const pid='player001', hash='a'.repeat(64), score=900000;
function setup() {
  const data=new Map(), m=Object.create(Matchmaker.prototype);
  m.state={storage:{get:async k=>data.get(k),put:async(k,v)=>data.set(k,structuredClone(v)),delete:async keys=>{for(const k of [].concat(keys))data.delete(k);}}};
  m.state.storage.transaction=async fn=>fn(m.state.storage);
  m.loadFriends=async()=>{};m.ensureBests=async()=>{};
  m.presence={keyOk:(p,k)=>p===pid&&k==='secret',isBanned:()=>false,removedAt:()=>0,boards:new Map([[hash,[{pid,score}]]]),ranks:new Map([[pid,{bests:{[hash]:{score}}}]])};
  const replay={app:'Ashtonk!mania',kind:'replay',id:'fixture',mapHash:hash,keys:4,mods:[],windows:[16,40,70,100,130,160],summary:{scoreStd:score},events:Array.from({length:12000},(_,i)=>[i, i%4, i%2]).flat()};
  const post=(patch={})=>m.publicReplay(new Request('https://game.test/shared-replay',{method:'POST',body:JSON.stringify({pid,key:'secret',hash,score,replay,...patch})}));
  const get=(value=score)=>m.publicReplay(new Request(`https://game.test/shared-replay?pid=${pid}&hash=${hash}&score=${value}`));
  return {m,data,replay,post,get};
}
test('shared replays round-trip across bounded storage chunks and replace old chunks',async()=>{
  const {data,replay,post,get}=setup();
  assert.equal((await get()).status,404);
  assert.deepEqual(await (await post()).json(),{ok:true});
  assert.deepEqual(await (await get()).json(),replay);
  for(const [key,value] of data)if(typeof value==='string')assert.ok(new TextEncoder().encode(value).length<128000,key);
  const size=data.size;await post();assert.equal(data.size,size,'replacing replay clears superseded chunks');
  assert.equal((await get(score-1)).status,404,'another score cannot play the wrong replay');
});
test('replay publishing authenticates player, requires a current best and validates game inputs',async()=>{
  const {m,post,replay,get}=setup();
  assert.equal((await post({key:'wrong'})).status,403);
  assert.equal((await post({replay:{...replay,events:[0,99,1]}})).status,400);
  assert.equal((await post({replay:{...replay,events:[100,0,1,50,0,0]}})).status,400);
  m.presence.boards.clear();m.presence.ranks.clear();
  assert.deepEqual(await(await post()).json(),{ok:false});
  assert.equal((await get()).status,404);
});
