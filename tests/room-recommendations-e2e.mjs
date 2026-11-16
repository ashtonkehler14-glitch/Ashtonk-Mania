// CHROMIUM_PATH=/usr/bin/chromium node tests/home-theme-e2e.mjs
import assert from 'node:assert/strict';
import { RoomLogic } from '../worker/multiplayer.js';
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
  const logic=new RoomLogic('ROOM');logic.join('a','Alice',true);logic.join('b','Bob',false);
  await page.exposeFunction('roomCommand',m=>{const out=logic.message('a',m);return {room:logic.snapshot(),errors:out.filter(x=>x.msg?.t==='error')};});
  await page.evaluate(room=>{
    Overlays.closeAll();Settings.set('audio.autoplay',false);
    Multiplayer.me='a';Multiplayer.code='ROOM';Multiplayer.room=room;
    Multiplayer.ws={readyState:1,send(text){window._lastRoomCommand=JSON.parse(text);window._commandDone=window.roomCommand(JSON.parse(text)).then(out=>{Multiplayer.room=out.room;window._roomErrors=out.errors;MultiplayerScreen.refreshSuggestionActions();});}};
  },logic.snapshot());

  await page.evaluate(async()=>{await Screens.go('multiplayer');});await page.waitForFunction(()=>!Screens.busy);
  await page.evaluate(()=>{
    window.localRecommendation={id:'local-rec',setId:'fixture-set',hash:'a'.repeat(32),title:'Recommended Song',artist:'Artist',version:'Hard',creator:'Mapper',keys:4,stars:4,length:120,onlineId:101,problems:[]};
    BeatmapManager.maps.set(localRecommendation.id,localRecommendation);BeatmapManager.setById.set('fixture-set',{id:'fixture-set',onlineId:201});
    MultiplayerScreen.appendChat({from:'b',pid:'bob-fixture',name:'Bob',text:'Recommended Song',suggest:{...localRecommendation,onlineSetId:201},ts:Date.now()});
  });
  const set=page.getByRole('button',{name:'Set song',exact:true}),queue=page.locator('.mp-suggest-action[data-action=queue]');
  await set.click();await page.evaluate(()=>window._commandDone);
  assert.equal(logic.map?.hash,'a'.repeat(32),'Set song changes the actual room map');
  await queue.click();await page.evaluate(()=>window._commandDone);
  assert.equal(logic.queue.length,1,'Queue action adds the recommendation to the real room queue');
  assert.deepEqual(await page.evaluate(()=>window._roomErrors),[]);
  await page.screenshot({path:'/tmp/room-recommendation-actions.png'});
  await page.evaluate(()=>{
    Multiplayer.room.host='b';MultiplayerScreen.refreshSuggestionActions();
  });
  assert.equal(await set.isDisabled(),true);assert.equal(await queue.isDisabled(),true);
  await page.evaluate(()=>{Multiplayer.room.settings.queue='all';MultiplayerScreen.refreshSuggestionActions();});
  assert.equal(await queue.isDisabled(),false,'Everyone queue mode permits queueing');assert.equal(await set.isDisabled(),true);
  await page.evaluate(()=>{
    Multiplayer.room.host='a';Multiplayer.room.settings.queue='host';BeatmapManager.maps.delete('local-rec');
    OnlineBeatmaps.downloadAndImport=async()=>{window._downloadRequested=true;await new Promise(r=>window._finishRecommendationDownload=r);BeatmapManager.maps.set('local-rec',localRecommendation);};
    MultiplayerScreen.refreshSuggestionActions();
  });
  await queue.click();await page.waitForFunction(()=>window._downloadRequested);
  assert.equal(await set.isDisabled(),true);assert.equal(await queue.isDisabled(),true);
  await page.evaluate(()=>window._finishRecommendationDownload());await page.waitForFunction(()=>window._lastRoomCommand.t==='queue' && !document.querySelector('.suggest[data-busy]'));
  await page.evaluate(()=>window._commandDone);assert.equal(logic.queue.length,2,'A missing recommendation downloads before being queued');
  await page.evaluate(()=>{BeatmapManager.maps.delete('local-rec');window._downloadRequested=false;});
  await queue.click();await page.waitForFunction(()=>window._downloadRequested);
  await page.evaluate(()=>{Multiplayer.room=null;Multiplayer.code='LEFT';window._finishRecommendationDownload();});
  await page.waitForFunction(()=>!document.querySelector('.suggest[data-busy]'));
  assert.equal(logic.queue.length,2,'Leaving during download never changes the old room');
  assert.deepEqual(errors,[]);
  console.log('PASS recommendation set/queue with real room logic, permissions, missing-map download, busy buttons and room leave');
} finally {if(browser)await browser.close();server.close();}
