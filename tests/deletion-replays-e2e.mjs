// CHROMIUM_PATH=/usr/bin/chromium node tests/deletion-replays-e2e.mjs
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright'), root = new URL('../', import.meta.url);
const server = createServer((req, res) => {
  const path = req.url.split('?')[0]; if (path.includes('..')) return res.writeHead(403).end();
  for (const p of [path === '/' ? 'index.html' : path.slice(1), 'public' + path]) {
    try { const data = readFileSync(new URL(p, root)); res.setHeader('content-type', path === '/' ? 'text/html' : path.endsWith('.js') ? 'text/javascript' : 'application/octet-stream'); return res.end(data); } catch {}
  }
  res.writeHead(404).end();
}).listen(0, '127.0.0.1');
await new Promise(r => server.once('listening', r)); let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 591 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }), errors = [];
  await page.addInitScript(() => localStorage.setItem('am.noInstallPrompt', '1'));
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`); await page.waitForFunction(() => document.querySelector('#loading-screen.done'));
  if (await page.$('.onboarding')) {
    if (await page.$('.setup-choice[data-id=new]')) await page.click('.setup-choice[data-id=new]');
    await page.fill('.onboarding .ob-name', 'MobileTester'); await page.keyboard.press('Enter');
    await page.waitForSelector('.setup-step-wom, .setup-step-mobile'); await page.evaluate(() => Onboarding.finish());
  }
  await page.waitForFunction(() => !Screens.busy);


  await page.evaluate(async()=>{
    while(Overlays.top())Overlays.top().close();
    const blob=await(await fetch('/tests/fixtures/test-set.osz')).blob();
    await App.importFiles([new File([blob],'test-set.osz')]);
    SongSelect.schedulePreview=()=>{};SongSelect.showBackground=()=>{};SongSelect.loopTrack=()=>{};
    const source=BeatmapManager.sets[0], base=source.maps[0];
    const sets=Array.from({length:80},(_,i)=>{
      const id='fixture-'+i, map={...base,id:'map-'+i,setId:id,hash:String(i).padStart(64,'a')};
      return {...source,id,title:'Song '+String(i).padStart(3,'0'),added:i,maps:[map]};
    });
    BeatmapManager.sets=sets;BeatmapManager.maps=new MapIndex(sets.map(s=>[s.maps[0].id,s.maps[0]]));BeatmapManager.setById=new Map(sets.map(s=>[s.id,s]));
    while(Screens.busy)await new Promise(r=>setTimeout(r,30));
    await Screens.go('songselect');
    while(Screens.busy)await new Promise(r=>setTimeout(r,30));

  });
  await page.waitForFunction(()=>Array.isArray(SongSelect.results)&&SongSelect.results.length>50);
  await page.evaluate(()=>{SongSelect.select('map-40');SongSelect.scrollToSelected(false,true);});
  await page.waitForTimeout(700);
  await page.evaluate(()=>{
    const sc=SongSelect.scroller,before=sc.scrollTop,id=SongSelect.selectedId;
    const map=BeatmapManager.maps.get(id);BeatmapManager.maps.delete(id);BeatmapManager.sets=BeatmapManager.sets.filter(s=>s.id!==map.setId);BeatmapManager.setById.delete(map.setId);
    Bus.emit('library:changed');
    if(Math.abs(sc.scrollTop-before)>2||sc.scrollTop===0)throw Error('Song carousel jumped after deletion');
    if(SongSelect.selectedId==='map-0')throw Error('Selected the first map after deletion');
  });
  await page.evaluate(async()=>{await Screens.go('beatmaps');});await page.waitForTimeout(500);
  await page.evaluate(()=>{const sc=BeatmapsScreen._scroller;sc.scrollTop=1500;BeatmapsScreen.renderWindow();});await page.waitForTimeout(200);
  await page.evaluate(()=>{
    const sc=BeatmapsScreen._scroller,before=sc.scrollTop;
    BeatmapManager.sets=BeatmapManager.sets.slice(1);Bus.emit('library:changed');
    if(Math.abs(sc.scrollTop-before)>2||before===0)throw Error('Beatmap library jumped after deletion '+before+' -> '+sc.scrollTop);
  });
  await page.evaluate(async()=>{
    const map=BeatmapManager.sets[30].maps[0];
    const score={id:'o-player001',pid:'player001',online:true,mapHash:map.hash,player:'Other player',accuracy:.99,grade:'S',score:900000,scoreStd:900000,counts:[99,1,0,0,0,0],mods:[],keys:4,maxCombo:100,pp:123,passed:true,date:Date.now(),title:map.title,artist:map.artist};
    window.testReplay=ReplayManager.build({map,mods:[],rate:1,seed:1,windows:[16,40,70,100,130,160],keys:4,hp:5,accuracyMode:'v2',events:[1000,0,1,1010,0,0],summary:score,player:score.player});
    await Screens.go('results',{score,browse:true,watched:'online'});
    window.oldLaunch=Game.launch;Game.launch=p=>{window.watchedReplay=p;};
  });
  await page.route('**/api/mp/replay?*',async route=>route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(await page.evaluate(()=>window.testReplay))}));
  await page.getByRole('button',{name:'Watch replay',exact:true}).click();
  await page.waitForFunction(()=>window.watchedReplay);
  assert.equal(await page.evaluate(()=>window.watchedReplay.mode),'replay');
  assert.equal(await page.evaluate(()=>window.watchedReplay.replay.own),false);
  await page.evaluate(()=>{Game.launch=window.oldLaunch;});
  assert.deepEqual(errors,[]);
  console.log('PASS map deletion position in carousel/library and watching another player’s replay');
} finally {if(browser)await browser.close();server.close();}
