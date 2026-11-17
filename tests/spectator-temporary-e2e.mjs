// CHROMIUM_PATH=/usr/bin/chromium node tests/home-theme-e2e.mjs
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
  const page = await browser.newPage({ viewport: process.env.CARD_PORTRAIT==='1' ? { width: 390, height: 844 } : { width: 1280, height: process.env.CARD_TOUCH==='1'?390:591 }, isMobile: process.env.CARD_TOUCH==='1', hasTouch: process.env.CARD_TOUCH==='1', deviceScaleFactor: 1 }), errors = [];
  await page.addInitScript(() => localStorage.setItem('am.noInstallPrompt', '1'));
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`); await page.waitForFunction(() => document.querySelector('#loading-screen.done'));
  if (await page.$('.onboarding')) {
    if (await page.$('.setup-choice[data-id=new]')) await page.click('.setup-choice[data-id=new]');
    await page.fill('.onboarding .ob-name', 'MobileTester'); await page.keyboard.press('Enter');
    await page.waitForSelector('.setup-step-wom, .setup-step-mobile'); await page.evaluate(() => Onboarding.finish());
  }
  await page.waitForFunction(() => !Screens.busy);
  const result=await page.evaluate(async()=>{
    Overlays.closeAll();Settings.set('audio.autoplay',false);
    const file=new File([await(await fetch('/tests/fixtures/test-set.osz')).blob()],'test-set.osz');
    const count=async()=>({sets:(await DB.getAll('sets')).length,maps:(await DB.getAll('maps')).length,files:(await DB.getAllKeys('files')).length});
    const before=await count(),librarySize=BeatmapManager.sets.length;
    const probe=await BeatmapManager.importTemporary(file);probe.mount();const rec=probe.sets[0].maps[0];
    const head={mapHash:rec.hash,checksum:await Spectate.checksumFor(rec),onlineId:rec.onlineId,onlineSetId:42,title:rec.title};probe.release();
    let downloads=0,starts=0;OnlineBeatmaps.download=async()=>{downloads++;return file;};Spectate.tryStart=()=>starts++;
    Presence.ws={readyState:1,send(){}};Presence.send=()=>{};Presence.pushStatus=()=>{};
    RankedWatch.on=true;RankedWatch.room={map:{onlineSetId:42}};Spectate.cur=null;RankedWatch.prefetch();RankedWatch.on=false;
    Spectate.target={id:'host',name:'Friend'};Spectate.cur={head,ended:false,lookup:{state:'exact',setId:42}};
    await Promise.all([Spectate.download(),Spectate.download()]);
    const temp=Spectate.findMap(head),loaded=temp && await BeatmapManager.load(temp.id);
    const during=await count(),hidden=BeatmapManager.sets.length===librarySize,temporary=!!temp?.temporary,playable=!!loaded?.notes?.length;
    Spectate.stop({quiet:true});const cleaned=!BeatmapManager.mapByHash(head.mapHash),after=await count();
    await BeatmapManager.importFiles([file]);const owned=BeatmapManager.mapByHash(head.mapHash),ownedSet=BeatmapManager.setById.get(owned.setId),ownedBytes=await(await BeatmapManager.getFile(owned.setId,owned.osuPath)).text();
    const ownedBefore=await count();const extra=await BeatmapManager.importTemporary(file);extra.mount();extra.release();
    const preserved=BeatmapManager.maps.get(owned.id)===owned && BeatmapManager.setById.get(owned.setId)===ownedSet && await(await BeatmapManager.getFile(owned.setId,owned.osuPath)).text()===ownedBytes;
    Spectate.target={id:'host',name:'Friend'};Spectate.cur={head,ended:false,lookup:{state:'exact',setId:42}};await Spectate.download();Spectate.stop({quiet:true});
    return {before,during,after,hidden,temporary,playable,cleaned,downloads,starts,preserved,ownedBefore,ownedAfter:await count()};
  });
  assert.deepEqual(result.during,result.before,'Spectator imports write no files, maps or sets to IndexedDB');
  assert.deepEqual(result.after,result.before);assert.ok(result.hidden && result.temporary && result.playable && result.cleaned);
  assert.equal(result.downloads,1,'Owned exact maps are reused without downloading or reinstalling');
  assert.ok(result.preserved,'Temporary archives never replace an existing owned map or files');assert.deepEqual(result.ownedAfter,result.ownedBefore);
  assert.deepEqual(errors,[]);console.log('PASS memory-only spectator maps, actual playback loading, duplicate request suppression, cleanup and owned map preservation');
} finally {if(browser)await browser.close();server.close();}
