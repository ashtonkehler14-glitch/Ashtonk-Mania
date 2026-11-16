import test from 'node:test';
import assert from 'node:assert/strict';
import { PresenceLogic, RoomLogic } from '../worker/multiplayer.js';
test('chat mention identities are resolved by the server and retained in history',()=>{
  const p=new PresenceLogic(()=>1000);
  p.join('a',{name:'Alice',pid:'alicepid00',key:'a'.repeat(30)});
  p.join('b',{name:'Bob Friend',pid:'bobpid0000',key:'b'.repeat(30)});
  const result=p.message('a',{t:'say',text:'hi @Bob Friend!',mentions:[{pid:'fake',name:'Bob Friend'}]});
  const line=result.find(x=>x.msg.t==='say').msg;
  assert.equal(line.mentions[0].pid,'bobpid0000');assert.equal(p.chat.at(-1).mentions[0].pid,'bobpid0000');
  p.message('b',{t:'watch',to:'a',chat:true});
  const spec=p.message('b',{t:'specChat',to:'a',text:'@Alice nice play'}).find(x=>x.msg.t==='specChat').msg.line;
  assert.equal(spec.mentions[0].pid,'alicepid00');
  const history=p.message('b',{t:'specChatHistory',to:'a'})[0].msg.lines;
  assert.equal(history[0].mentions[0].pid,'alicepid00');
});
test('room mentions use full names and ignore spoofed IDs and partial names',()=>{
  const r=new RoomLogic('ROOM');r.join('a','Alice',true,{pid:'alicepid00'});r.join('b','A+B Friend',false,{pid:'bobpid0000'});
  const found=r.message('a',{t:'chat',text:'hey @A+B Friend!',mentions:[{pid:'fake',name:'A+B Friend'}]})[0].msg;
  assert.equal(found.mentions[0].pid,'bobpid0000');
  assert.equal(r.message('a',{t:'chat',text:'hey @A+B Friendship'})[0].msg.mentions,undefined);
});
