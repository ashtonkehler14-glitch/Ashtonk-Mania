import test from 'node:test';
import assert from 'node:assert/strict';
import { PresenceLogic, RoomLogic } from '../worker/multiplayer.js';
function presence(){let time=1000;const p=new PresenceLogic(()=>time);for(const [id,name] of [['a','Alice'],['b','Bob'],['c','Cat']])p.join(id,{pid:id.repeat(8),name,key:id.repeat(32)});return {p,advance(){time+=6000;}};}
test('only the author may edit or delete a public message and history retains the change',()=>{
 const {p,advance}=presence(),line=p.message('a',{t:'say',text:'original'})[0].msg;
 assert.deepEqual(p.message('b',{t:'chatChange',scope:'lobby',mid:line.mid,action:'edit',text:'forged'}),[]);
 advance();const change=p.message('a',{t:'chatChange',scope:'lobby',mid:line.mid,action:'edit',text:'edited'});
 assert.equal(change[0].msg.line.text,'edited');assert.ok(change[0].msg.line.editedAt);
 assert.equal(p.chat[0].text,'edited');
 p.message('a',{t:'chatChange',scope:'lobby',mid:line.mid,action:'delete'});assert.equal(p.chat[0].deleted,true);assert.equal(p.chat[0].text,'');
 assert.deepEqual(p.message('a',{t:'chatChange',scope:'lobby',mid:line.mid,action:'edit',text:'resurrect'}),[]);
});
test('same-millisecond messages have distinct IDs and editing respects filtering and mute rules',()=>{
 const {p,advance}=presence();p.chatRules.words=['blocked'];
 const a=p.message('a',{t:'say',text:'one'})[0].msg,b=p.message('a',{t:'say',text:'two'})[0].msg;assert.notEqual(a.mid,b.mid);
 advance();p.message('a',{t:'chatChange',scope:'lobby',mid:b.mid,action:'edit',text:'blocked'});assert.notEqual(p.chat[1].text,'blocked');assert.equal(p.chat[0].text,'one');
 p.adminMute('aaaaaaaa',{minutes:10});const out=p.message('a',{t:'chatChange',scope:'lobby',mid:a.mid,action:'edit',text:'new'});assert.equal(out[0].msg.t,'error');
 p.message('a',{t:'chatChange',scope:'lobby',mid:a.mid,action:'delete'});assert.equal(p.chat[0].deleted,true);
});
test('room messages update for everyone but cannot be changed by another player',()=>{
 const r=new RoomLogic('ROOM');r.join('a','Alice',true,{pid:'aaaaaaaa'});r.join('b','Bob',false,{pid:'bbbbbbbb'});
 const line=r.message('a',{t:'chat',text:'hello'})[0].msg;
 assert.deepEqual(r.message('b',{t:'chatChange',mid:line.mid,action:'delete'}),[]);
 const edit=r.message('a',{t:'chatChange',mid:line.mid,action:'edit',text:'updated'});assert.equal(edit[0].to,'all');assert.equal(r.chatLog[0].text,'updated');
 r.message('a',{t:'chatChange',mid:line.mid,action:'delete'});assert.equal(r.chatLog[0].deleted,true);
});
test('spectator edits stay within the group and require membership and authorship',()=>{
 const {p}=presence();p.message('b',{t:'watch',to:'a',chat:true});
 const line=p.message('b',{t:'specChat',to:'a',text:'nice'})[0].msg.line;
 assert.deepEqual(p.message('c',{t:'chatChange',scope:'spectator',to:'a',mid:line.mid,action:'delete'}),[]);
 assert.deepEqual(p.message('a',{t:'chatChange',scope:'spectator',to:'a',mid:line.mid,action:'delete'}),[]);
 const out=p.message('b',{t:'chatChange',scope:'spectator',to:'a',mid:line.mid,action:'edit',text:'nice play'});assert.equal(out.length,2);assert.equal(out[0].msg.line.text,'nice play');
});
test('private messages preserve edits and deletions for the peer returning later',()=>{
 const {p}=presence();p.makeFriends('aaaaaaaa','Alice','bbbbbbbb','Bob');
 const line=p.message('a',{t:'pm',to:'bbbbbbbb',text:'private'})[0].msg;
 assert.deepEqual(p.message('c',{t:'chatChange',scope:'pm',to:'bbbbbbbb',mid:line.mid,action:'edit',text:'forged'}),[]);
 p.leave('b');p.message('a',{t:'chatChange',scope:'pm',to:'bbbbbbbb',mid:line.mid,action:'edit',text:'changed'});
 const history=p.join('b2',{pid:'bbbbbbbb',name:'Bob',key:'b'.repeat(32)}).find(o=>o.msg.t==='pmHist');assert.equal(history.msg.list[0].text,'changed');
 p.message('a',{t:'chatChange',scope:'pm',to:'bbbbbbbb',mid:line.mid,action:'delete'});assert.equal(p.privateChat.get(p.privateKey('aaaaaaaa','bbbbbbbb')).lines[0].deleted,true);
});
test('offline friends can be mentioned and receive a queued notification once on return',()=>{
 const {p}=presence();p.makeFriends('aaaaaaaa','Alice','bbbbbbbb','Bob');p.leave('b');
 const line=p.message('a',{t:'say',text:'hey @Bob'})[0].msg;assert.equal(line.mentions[0].pid,'bbbbbbbb');assert.equal(p.mentionInbox.get('bbbbbbbb').length,1);
 const returned=p.join('b2',{pid:'bbbbbbbb',name:'Bob',key:'b'.repeat(32)});assert.equal(returned.find(o=>o.msg.t==='offlineMentions').msg.list[0].mid,line.mid);
 assert.equal(p.mentionInbox.has('bbbbbbbb'),false);
});
test('deleting a mention before an offline friend returns removes its queued notification',()=>{
 const {p}=presence();p.makeFriends('aaaaaaaa','Alice','bbbbbbbb','Bob');p.leave('b');
 const line=p.message('a',{t:'say',text:'@Bob hi'})[0].msg;p.message('a',{t:'chatChange',scope:'lobby',mid:line.mid,action:'delete'});assert.equal(p.mentionInbox.has('bbbbbbbb'),false);
});
