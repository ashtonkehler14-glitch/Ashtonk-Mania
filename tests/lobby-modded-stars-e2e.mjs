// CHROMIUM_PATH=/usr/bin/chromium node tests/home-theme-e2e.mjs
import assert from 'node:assert/strict';
import {RoomLogic} from '../worker/multiplayer.js';
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
  await page.evaluate(async()=>{
    Overlays.closeAll();Settings.set('audio.autoplay',false);
    const blob=await(await fetch('/tests/fixtures/test-set.osz')).blob();await App.importFiles([new File([blob],'test-set.osz')]);Overlays.closeAll();
  });
  const map=await page.evaluate(()=>Multiplayer.mapInfo([...BeatmapManager.maps.values()].find(m=>m.keys===4)));
  const logic=new RoomLogic('ROOM');logic.join('a','Alice',true);logic.join('b','Bob',false);logic.message('a',{t:'map',map});logic.message('a',{t:'rate',mods:['DT']});
  await page.exposeFunction('roomStarsCommand',m=>{logic.message('a',m);return logic.snapshot();});
  await page.evaluate(async room=>{
    Multiplayer.me='a';Multiplayer.code='ROOM';Multiplayer.room=room;Multiplayer.ws={readyState:1,send(text){window._starsReply=window.roomStarsCommand(JSON.parse(text)).then(room=>Multiplayer.onMessage({t:'room',room}));}};
    await Screens.go('multiplayer');
  },logic.snapshot());
  await page.waitForFunction(()=>!Screens.busy && document.querySelector('.mp-map-d .mod-star-rating .stars'));
  const expected=await page.evaluate(async()=>{
    const map=Multiplayer.localMap(),{notes}=await BeatmapManager.load(map.id);
    return DifficultyCalculator.calculate(notes,map.keys,1.5).toFixed(2);
  });
  assert.equal((await page.locator('.mp-map-d .mod-star-rating .stars').textContent()).trim(),expected);
  await page.waitForFunction(()=>[...document.querySelector('select[aria-label="Your difficulty"]').options].every(o=>!o.textContent.includes('…')));
  const options=await page.evaluate(async()=>{
    const select=document.querySelector('select[aria-label="Your difficulty"]');
    return Promise.all([...select.options].map(async o=>{const map=BeatmapManager.maps.get(o.value),{notes}=await BeatmapManager.load(map.id);return {text:o.textContent,expected:DifficultyCalculator.calculate(notes,map.keys,1.5).toFixed(2)};}));
  });
  assert.ok(options.every(o=>o.text.includes('★'+o.expected)),'Every difficulty option uses the room rate');
  await page.locator('select[aria-label="Your difficulty"]').evaluate(el=>{el.selectedIndex=1;el.dispatchEvent(new Event('change',{bubbles:true}));});await page.evaluate(()=>window._starsReply);
  assert.ok(logic.players.find(p=>p.id==='a').diff?.hash,'Choosing a difficulty sends its exact identity');
  logic.settings.speed='own';logic.mods=[];logic.modConfig=null;logic.message('b',{t:'mods',mods:['RT'],modConfig:{rate:1.35}});
  await page.evaluate(room=>{Multiplayer.room=room;MultiplayerScreen.refreshRoom();},logic.snapshot());
  const peerExpected=await page.evaluate(async()=>{const map=Multiplayer.localMap(),{notes}=await BeatmapManager.load(map.id);return DifficultyCalculator.calculate(notes,map.keys,1.35).toFixed(2);});
  await page.waitForFunction(value=>[...document.querySelectorAll('.mp-pdiff')].some(e=>e.textContent.includes('★'+value)),peerExpected);
  assert.ok((await page.locator('.mp-pdiff').allTextContents()).some(t=>t.includes('★'+peerExpected)),'Peer custom rate is reflected in their label');
  await page.evaluate(async()=>{
    Settings.set('songselect.mods',['RT','HD']);Settings.set('mods.config',{...ModSystem.config(),rate:1.35});
    await Screens.go('songselect',{mpPick:true});
  });
  await page.waitForFunction(()=>!Screens.busy && Screens.currentName==='songselect');
  assert.deepEqual(await page.evaluate(()=>Settings.get('songselect.mods')),['RT','HD'],'Opening the lounge library keeps mods');
  await page.evaluate(()=>{for(const m of BeatmapManager.maps.values())SongSelect.select(m.id);SongSelect.searched();});
  assert.deepEqual(await page.evaluate(()=>Settings.get('songselect.mods')),['RT','HD'],'Browsing and rebuilding the lounge library keeps mods');
  await page.evaluate(async()=>{Multiplayer.room=null;await Screens.go('songselect',{force:true});});
  await page.waitForFunction(()=>!Screens.busy);
  assert.deepEqual(await page.evaluate(()=>Settings.get('songselect.mods')),['RT'],'Solo selection keeps custom speed');
  await page.evaluate(()=>{for(const m of BeatmapManager.maps.values())SongSelect.select(m.id);});
  assert.deepEqual(await page.evaluate(()=>Settings.get('songselect.mods')),['RT'],'Solo song changes keep custom speed');
  assert.equal(await page.evaluate(()=>ModSystem.config().rate),1.35,'Custom rate stays unchanged while browsing');
  const smooth = await page.evaluate(async()=>{
    const original=SongSelect.preview, nativeAnimate=Element.prototype.animate, seen=[];let flashes=0;
    SongSelect.preview=async m=>seen.push(m.id);
    Element.prototype.animate=function(...args){if(this.matches('.wedge,.wd'))flashes++;return nativeAnimate.apply(this,args);};
    const maps=[...BeatmapManager.maps.values()];Music.meta=null;
    try {
      for(let i=0;i<6;i++){SongSelect.select(maps[i%maps.length].id);await new Promise(r=>setTimeout(r,80));}
      await new Promise(r=>setTimeout(r,200));
      return {seen,selected:SongSelect.selectedId,flashes};
    } finally {SongSelect.preview=original;Element.prototype.animate=nativeAnimate;}
  });
  assert.equal(smooth.flashes,0,'Changing songs does not restart opacity flashes on the details');
  assert.deepEqual(smooth.seen,[smooth.selected],'Rapid song changes load only the final audio preview');

  await page.screenshot({path:'/tmp/lobby-modded-stars.png'});
  assert.deepEqual(errors,[]);
  console.log('PASS lobby modded ratings, exact diff selection, solo speed retention and lounge mod retention');
} finally {if(browser)await browser.close();server.close();}
