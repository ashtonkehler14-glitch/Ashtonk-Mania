import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load.mjs';
function fixture(){
 const x=load(['00-util.js','08-mods.js','14-screen-songselect.js']),pending=[],shown=[];
 Object.assign(x.__ctx,{Settings:{get:()=> 'high'},BeatmapManager:{setById:new Map(),bgURL:async m=>'blob:'+m.id,thumbURL:async()=>null},Background:{current:'old',set:url=>shown.push(url)},Image:class {decode(){return new Promise((resolve,reject)=>pending.push({resolve,reject}));}}});
 return {...x,pending,shown};
}
test('song select keeps its previous background until the replacement is decoded',async()=>{
 const x=fixture();x.SongSelect.selectedId='a';const task=x.SongSelect.showBackground({id:'a',setId:'s'});await new Promise(r=>setTimeout(r,0));
 assert.equal(x.pending.length,1);assert.deepEqual(x.shown,[]);x.pending[0].resolve();await task;assert.deepEqual(x.shown,['blob:a']);
});
test('a slower old background never replaces the latest selection',async()=>{
 const x=fixture();x.SongSelect.selectedId='a';const a=x.SongSelect.showBackground({id:'a',setId:'s'});await new Promise(r=>setTimeout(r,0));
 x.SongSelect.selectedId='b';const b=x.SongSelect.showBackground({id:'b',setId:'s'});await new Promise(r=>setTimeout(r,0));
 x.pending[1].resolve();await b;x.pending[0].resolve();await a;assert.deepEqual(x.shown,['blob:b']);
});
test('unreadable artwork does not flash an empty background',async()=>{
 const x=fixture();x.SongSelect.selectedId='a';const task=x.SongSelect.showBackground({id:'a',setId:'s'});await new Promise(r=>setTimeout(r,0));x.pending[0].reject(new Error('bad image'));await task;assert.deepEqual(x.shown,[]);
});
