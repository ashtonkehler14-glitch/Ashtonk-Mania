import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load.mjs';
function fixture(mods, room=false) {
 const x=load(['00-util.js','08-mods.js','07-beatmap-manager.js','14-screen-songselect.js','17b-screen-explorer.js']);
 let selected=mods;const events=[],picks=[];
 Object.assign(x.__ctx,{Settings:{get:()=>selected,set:(k,v)=>{selected=v;}},Multiplayer:{inRoom:()=>room,isHost:()=>true,selectMap:(m,mods)=>picks.push(mods)},Bus:{emit:e=>events.push(e)},Toast:{ok(){},show(){},err(a,b){throw new Error(a+': '+b);}},Screens:{go(){}},BeatmapManager:{maps:new Map([['a',{id:'a',onlineId:7,problems:[]}]])}});
 x.BeatmapManager.maps=new Map([['a',{id:'a',onlineId:7,problems:[]}]]);
 x.Bus.on('mods:changed',()=>events.push('mods:changed'));
 x.SongSelect.mpPick=room;
 return {...x,get:()=>Array.from(selected),events,picks};
}
test('solo song changes keep every speed modifier',()=>{
 for(const speed of ['DT','NC','HT','DC','RT','WU','WD','AS']){
  const x=fixture([speed,'HD','MR']);assert.equal(x.SongSelect.resetMods(),true);assert.deepEqual(x.get(),[speed]);assert.equal(x.SongSelect.resetMods(),false);
 }
});
test('lounge browsing preserves all chosen mods, while explicit explorer reset clears them',()=>{
 const x=fixture(['NC','HD','MR'],true);assert.equal(x.SongSelect.resetMods(),false);assert.deepEqual(x.get(),['NC','HD','MR']);
 assert.equal(x.SongSelect.resetMods({all:true}),true);assert.deepEqual(x.get(),[]);
});
test('explorer lounge map picks clear mods before sending the chosen map',async()=>{
 const x=fixture(['NC','HD'],true);x.ExplorerScreen.owned=()=>null;
 await x.ExplorerScreen.mpPickDiff({id:1},{id:7});
 assert.deepEqual(x.get(),[]);assert.deepEqual(Array.from(x.picks[0]),[]);assert.deepEqual(x.events,['mods:changed']);
});
test('explorer solo selection clears speed mods before starting its preview',()=>{
 const x=fixture(['RT','HD']);const e=x.ExplorerScreen;e.stopPreview=()=>{};e.closeSet=()=>{};x.SongSelect.preview=()=>assert.deepEqual(x.get(),[]);
 e.playLocal({id:'a'});assert.deepEqual(x.get(),[]);assert.deepEqual(x.events,['mods:changed']);
});
