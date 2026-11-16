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
  const page = await browser.newPage({ viewport: { width: 1280, height: 591 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 }), errors = [];
  await page.addInitScript(() => localStorage.setItem('am.noInstallPrompt', '1'));
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`); await page.waitForFunction(() => document.querySelector('#loading-screen.done'));
  if (await page.$('.onboarding')) {
    if (await page.$('.setup-choice[data-id=new]')) await page.click('.setup-choice[data-id=new]');
    await page.fill('.onboarding .ob-name', 'MobileTester'); await page.keyboard.press('Enter');
    await page.waitForSelector('.setup-step-wom, .setup-step-mobile'); await page.evaluate(() => Onboarding.finish());
  }
  await page.waitForFunction(() => !Screens.busy);
  await page.evaluate(()=>{
    Overlays.closeAll();Settings.set('audio.autoplay',false);
    window._exploreRequests=0;window._coverRequests=new Set();
    OnlineBeatmaps.search=async()=>{
      const page=window._exploreRequests++;
      return {sets:Array.from({length:100},(_,i)=>({id:page*100+i+1,title:'Song '+(page*100+i),artist:'Artist',creator:'Mapper',status:'ranked',favourites:10,playCount:100,diffs:[{id:i+1,version:'Hard',keys:4,stars:3,length:180,bpm:180}]})),cursor:page===0?'next':null,hasMore:page===0,total:200};
    };
    OnlineBeatmaps.loadCover=(el,id,kinds,done,queue)=>{window._coverRequests.add(id);done?.();};
  });
  await page.evaluate(async()=>Screens.go('explore'));await page.waitForFunction(()=>!Screens.busy && ExplorerScreen.results.length===100);await page.waitForTimeout(700);
  assert.equal(await page.evaluate(()=>window._exploreRequests),1,'Opening explorer fetches only the first page');
  assert.ok(await page.evaluate(()=>window._coverRequests.size<70),'Most offscreen covers remain unloaded');
  assert.ok(await page.locator('.ex-card').count()<70,'Only nearby cards are mounted');
  await page.evaluate(()=>{const sc=ExplorerScreen._scroller;sc.scrollTop=sc.scrollHeight;});
  await page.waitForFunction(()=>ExplorerScreen.results.length===200);await page.waitForTimeout(700);
  assert.equal(await page.evaluate(()=>window._exploreRequests),2,'Scrolling near the end loads the next page');
  assert.ok(await page.evaluate(()=>window._coverRequests.size<150),'Scrolling does not preload the whole result list');
  await page.evaluate(async()=>Screens.go('songselect'));await page.waitForFunction(()=>!Screens.busy);
  assert.equal(await page.locator('.ss.menu-surface').count(),0,'Song select keeps its original full-screen layout');
  await page.evaluate(()=>NowPlaying.show());const music=await page.locator('.np-player').boundingBox();
  await page.mouse.move(music.x+20,music.y+20);await page.mouse.down();await page.mouse.move(music.x+100,music.y+40);
  assert.equal(await page.locator('.np-panel').evaluate(el=>el.style.translate),'','Music panel stays anchored');await page.mouse.up();
  await page.evaluate(()=>NowPlaying.hide());
  assert.equal(await page.locator('#toolbar').evaluate(el=>getComputedStyle(el,'::after').display),'none');
  assert.deepEqual(errors,[]);
  console.log('PASS progressive explorer pages/covers, full-screen song select, anchored panels and toolbar shading');
} finally {if(browser)await browser.close();server.close();}
