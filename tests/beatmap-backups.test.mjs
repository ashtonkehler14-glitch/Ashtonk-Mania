import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
function harness(){
  const reads=[],downloads=[];
  const assets=new Map([['set1/map.osu',new Blob(['osu file format v14\n'])],['set1/song.mp3',new Blob(['audio'])],['set1/bg.jpg',new Blob(['picture'])]]);
  const Settings={schema:new Map([['audio.music',{}]]),values:{'audio.music':.5,'medals.unlocked':{'ss4':123},'account.secret':'kept'},clean:o=>({...o}),export(){return this.values;},async import(o){this.values=o;}};
  const ctx=vm.createContext({Blob,File,Response,TextEncoder,TextDecoder,DecompressionStream,TransformStream,console,APP_NAME:'Ashtonk!mania',APP_VERSION:'test',Settings,
    normPath:s=>s.replace(/\\/g,'/'),friendlyError:e=>e.message,
    DB:{async get(store,key){reads.push([store,key]);assert.equal(store,'files');return assets.get(key);}},
    BeatmapManager:{sets:[{id:'set1',artist:'Artist',title:'Song',fileIndex:{'map.osu':'map.osu','song.mp3':'song.mp3','bg.jpg':'bg.jpg'}}],async breathe(){}},
    Toast:{err(){},progress(){return {set(){},done(){},fail(){}};}},downloadBlob:(blob,name)=>downloads.push({blob,name}),downloadJSON:(obj,name)=>downloads.push({obj,name}),
    Bus:{emit(){}},});
  vm.runInContext(readFileSync(new URL('../src/js/02-zip.js',import.meta.url),'utf8')+readFileSync(new URL('../src/js/11-managers.js',import.meta.url),'utf8')+';globalThis.D=DataManager;globalThis.Z=ZipReader;globalThis.zip=writeZip;globalThis.zipBlobs=writeZipBlobs;',ctx);
  return {ctx,reads,downloads,assets,Settings};
}
test('full export contains actual beatmap assets and never reads account data',async()=>{
  const {ctx,reads,downloads}=harness();await ctx.D.exportAll();
  assert.match(downloads[0].name,/^ashtonk-mania-beatmaps-.*\.zip$/);
  const zip=await ctx.Z.fromFile(downloads[0].blob);
  assert.deepEqual(Array.from(zip.entries,e=>e.name),['0001 Artist - Song/map.osu','0001 Artist - Song/song.mp3','0001 Artist - Song/bg.jpg']);
  assert.equal(await zip.readText(zip.entries[0]),'osu file format v14\n');
  assert.equal(reads.length,3);
});
test('legacy backups cannot write scores, medals or account settings',async()=>{
  const {ctx,Settings,reads}=harness(),before=JSON.stringify(Settings.values);
  const malicious={app:'Ashtonk!mania',kind:'backup',scores:[{id:'fake'}],replays:[{id:'fake'}],profile:{name:'Fake'},settings:{'medals.unlocked':{ss4:999},'account.secret':'changed'}};
  await assert.rejects(ctx.D.importAll(malicious),/Account backups are no longer imported/);
  await assert.rejects(ctx.D.importFile(new File([JSON.stringify(malicious)],'old.json')),/Account backups are no longer imported/);
  assert.equal(JSON.stringify(Settings.values),before);assert.equal(reads.length,0);
});
test('settings files carry preferences and preserve existing account progress',async()=>{
  const {ctx,Settings,downloads}=harness();ctx.D.exportSettings();
  assert.deepEqual(JSON.parse(JSON.stringify(downloads[0].obj.settings)),{'audio.music':.5});
  await ctx.D.importAll({app:'Ashtonk!mania',kind:'settings',settings:{'audio.music':.8,'medals.unlocked':{fc9:777},'account.secret':'changed','future.account':'bad'}});
  assert.equal(Settings.values['audio.music'],.8);assert.deepEqual(Settings.values['medals.unlocked'],{ss4:123});assert.equal(Settings.values['account.secret'],'kept');assert.equal(Settings.values['future.account'],undefined);
});
test('Blob ZIP exports preserve checksums across multiple chunks and Unicode paths',async()=>{
  const {ctx}=harness(),bytes=new Uint8Array(2500000).map((_,i)=>i%251);let yields=0;
  const blob=await ctx.zipBlobs([{name:'曲/background.bin',blob:new Blob([bytes])}],async()=>yields++);
  const zip=await ctx.Z.fromFile(blob);assert.equal(zip.entries[0].name,'曲/background.bin');
  assert.deepEqual(Buffer.from(await zip.read(zip.entries[0])),Buffer.from(bytes));assert.equal(yields,3);
});
test('oversized Blob ZIP exports fail instead of writing corrupt ZIP32 offsets',async()=>{
  const {ctx}=harness();await assert.rejects(ctx.zipBlobs([{name:'huge',blob:{size:0x100000000}}]),/too large/);
});
test('WOM backup import ignores scores, settings and collections',async()=>{
  const {ctx,reads,Settings}=harness();
  vm.runInContext(readFileSync(new URL('../src/js/18c-wom-import.js',import.meta.url),'utf8')+';globalThis.W=WomImport;',ctx);
  const zip=ctx.zip([{name:'settings.json',data:new TextEncoder().encode('{"volume":0.1}')},{name:'highScores.json',data:new TextEncoder().encode('{"highScores":{"fake":{}}}')},{name:'collections.json',data:new TextEncoder().encode('{"fake":[999]}')}]);
  const out=await ctx.W.run(new File([zip],'backup.zip'));
  assert.equal(out.scores,0);assert.equal(out.settings,false);assert.equal(out.collections,0);assert.equal(reads.length,0);assert.equal(Settings.values['audio.music'],.5);
});
