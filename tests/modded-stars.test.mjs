import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';
import { PresenceLogic, RoomLogic } from '../worker/multiplayer.js';
function fixture(){
 const x=load(['00-util.js','03-beatmap-parser.js','03b-mania-convert.js','08-mods.js','09a-osu-math.js','09-gameplay.js','09c-verify.js','12e-modded-stars.js']);
 const notes=Array.from({length:240},(_,i)=>({time:i*100,end:i*100+(i%3===0?180:0),col:i%4,isLN:i%3===0}));
 const bm={mode:3,hitObjects:notes,timingPoints:[{time:0,beatLength:500,uninherited:true}],events:{breaks:[]}};
 const m={id:'map',hash:'hash',keys:4,mode:3,stars:x.DifficultyCalculator.calculate(notes,4,1),srVersion:3};
 x.__ctx.BeatmapManager={maps:new Map([['map',m]]),load:async()=>({bm,notes,rec:m})};
 return {...x,c:x.__ctx,m,notes,bm};
}
test('menu ratings match gameplay strain calculation for speed and note-changing mods',async()=>{
 const x=fixture();
 for(const [mods,config] of [[[],{}],[['DT'],{}],[['HT'],{}],[['RT'],{rate:1.35}],[['NLN'],{}],[['IN'],{}],[['DT','NLN'],{}],[['HD'],{}]]){
   const rate=x.ModSystem.rate(mods,config),notes=x.convertsNotes(mods)?x.prepareNotes(x.notes,4,mods,0,{red:x.BeatmapParser.timing(x.bm).red}):x.notes;
   const expected=x.DifficultyCalculator.calculate(notes,4,rate),actual=await x.ModdedStars.calculate(x.m,{mods,modConfig:config});
   assert.ok(Math.abs(actual-expected)<1e-10,mods.join('+'));
 }
 const normal=await x.ModdedStars.calculate(x.m),fast=await x.ModdedStars.calculate(x.m,{mods:['DT']});assert.ok(fast>normal);
});
test('rating cache distinguishes custom rates and deduplicates the same calculation',async()=>{
 const x=fixture();let loads=0;const original=x.c.BeatmapManager.load;x.c.BeatmapManager.load=async(...args)=>{loads++;return original(...args);};
 const a=x.ModdedStars.calculate(x.m,{mods:['RT'],modConfig:{rate:1.1}}),b=x.ModdedStars.calculate(x.m,{mods:['RT'],modConfig:{rate:1.1}});
 assert.equal(a,b);await a;assert.equal(loads,1);
 await x.ModdedStars.calculate(x.m,{mods:['RT'],modConfig:{rate:1.5}});assert.equal(loads,2);
});
test('missing maps do not substitute the base rating for a modified rating',async()=>{
 const x=fixture(),remote={hash:'not-installed',stars:5};assert.equal(x.ModdedStars.value(remote,{mods:['DT']}),null);
 await assert.rejects(()=>x.ModdedStars.calculate(remote,{mods:['DT']}),/not installed/);
 assert.equal(x.ModdedStars.value(remote,{mods:[]}),5);
});
test('spectator headers carry the actual played star rating through to current and late viewers',()=>{
 const p=new PresenceLogic(()=>1000);p.join('a',{name:'Alice'});p.join('b',{name:'Bob'});p.join('c',{name:'Third'});
 p.message('b',{t:'watch',to:'a'});
 const out=p.message('a',{t:'play',head:{mapHash:'hash',stars:6.37,keys:4,mods:['DT'],rate:1.5}});
 assert.equal(out[0].msg.head.stars,6.37);assert.equal(p.message('c',{t:'watch',to:'a'}).find(x=>x.msg.t==='specStart').msg.head.stars,6.37);
});
test('room snapshots preserve each player’s custom rate and exact chosen difficulty identity',()=>{
 const r=new RoomLogic('ROOM');r.join('a','Alice',true);r.join('b','Bob',false);r.settings.speed='own';
 r.message('a',{t:'map',map:{hash:'map',title:'Song',artist:'Artist',version:'Normal',keys:4,stars:3}});
 r.message('b',{t:'mods',mods:['RT'],modConfig:{rate:1.35}});r.message('b',{t:'diff',diff:{hash:'hard',onlineId:5,version:'Hard',keys:4,stars:5}});
 const b=r.snapshot().players.find(p=>p.id==='b');assert.equal(b.modConfig.rate,1.35);assert.equal(b.diff.hash,'hard');assert.equal(b.diff.onlineId,5);
});
