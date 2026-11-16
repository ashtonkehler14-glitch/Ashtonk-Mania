// CHROMIUM_PATH=/usr/bin/chromium node tests/home-theme-e2e.mjs
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright'), root = new URL('../', import.meta.url);
let fixtureCover=null;
const server = createServer((req, res) => {
  const path = req.url.split('?')[0];
  if(path.startsWith('/test-covers/') && fixtureCover){res.setHeader('content-type','image/png');return res.end(fixtureCover);}
 if (path.includes('..')) return res.writeHead(403).end();
  for (const p of [path === '/' ? 'index.html' : path.slice(1), 'public' + path]) {
    try { const data = readFileSync(new URL(p, root)); res.setHeader('content-type', path === '/' ? 'text/html' : path.endsWith('.js') ? 'text/javascript' : 'application/octet-stream'); return res.end(data); } catch {}
  }
  res.writeHead(404).end();
}).listen(0, '127.0.0.1');
await new Promise(r => server.once('listening', r)); let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 591 }, isMobile: process.env.DESKTOP !== '1', hasTouch: process.env.DESKTOP !== '1', deviceScaleFactor: 1 }), errors = [];
  await page.addInitScript(() => localStorage.setItem('am.noInstallPrompt', '1'));
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`); await page.waitForFunction(() => document.querySelector('#loading-screen.done'));
  if (await page.$('.onboarding')) {
    if (await page.$('.setup-choice[data-id=new]')) await page.click('.setup-choice[data-id=new]');
    await page.fill('.onboarding .ob-name', 'MobileTester'); await page.keyboard.press('Enter');
    await page.waitForSelector('.setup-step-wom, .setup-step-mobile'); await page.evaluate(() => Onboarding.finish());
  }
  await page.waitForFunction(() => !Screens.busy);
  assert.equal(await page.evaluate(async()=>{const faces=await document.fonts.load('600 16px Sora');return faces.length>0 && faces.every(face=>face.status==='loaded');}),true,'Bundled Sora font loads');


  await page.evaluate(()=>{while(Overlays.top())Overlays.top().close();Settings.set('ui.menuBackground','triangles');});
  await page.evaluate(()=>{HomeScreen.setState('play');HomeScreen._idleAt=performance.now();});
  await page.waitForTimeout(950);
  assert.match(await page.locator('.tb-clock .tb-time').textContent(),/^\d{2}:\d{2}:\d{2} (AM|PM)$/);
  assert.equal(await page.locator('.tb-clock .tb-analog, .tb-clock .tb-run').count(),0);
  assert.deepEqual(await page.evaluate(()=>[0,12,23].map(hour=>Toolbar.formatTime(new Date(2026,0,1,hour,2,3)))),['12:02:03 AM','12:02:03 PM','11:02:03 PM']);
  await page.click('.tb-clock');
  await page.waitForFunction(()=>Notifications.isOpen() && Toolbar.clock.getAttribute('aria-expanded')==='true');
  assert.equal(await page.locator('.tb-clock .tb-st').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(143, 40, 94)');
  await page.click('.tb-clock');
  await page.waitForFunction(()=>!Notifications.isOpen() && Toolbar.clock.getAttribute('aria-expanded')==='false');
  const greys=await page.evaluate(()=>['settings','back'].map(id=>getComputedStyle(document.querySelector(`.lz-btn[data-id="${id}"]`)).getPropertyValue('--c').trim()));
  assert.equal(greys[0],greys[1],'Settings and Back share the same grey');
  const art=await page.evaluate(()=>{
    const c=document.createElement('canvas');c.width=c.height=16;const x=c.getContext('2d');x.fillStyle='#3695d4';x.fillRect(0,0,16,16);return c.toDataURL();
  });
  fixtureCover=Buffer.from(art.split(',')[1],'base64');
  await page.evaluate(art=>{
    window._testArt=art;
    window._weeklyOriginal={localMap:Multiplayer.localMap,bgURL:BeatmapManager.bgURL,coverURL:OnlineBeatmaps.coverURL};
    Multiplayer.localMap=map=>map.fixtureLocal?{id:'fixture-map',bgFile:'fixture.jpg'}:null;
    BeatmapManager.bgURL=async()=>art;
    OnlineBeatmaps.coverURL=(id,kind)=>`${location.origin}/test-covers/${id}-${kind}.png`;
    Settings.set('graphics.performanceMode',true);
    Daily.data={map:{onlineSetId:9876501,onlineId:9876502,fixtureLocal:true},endsAt:Date.now()+3600000};
    HomeScreen.paintDaily();
  },art);
  await page.waitForFunction(()=>document.querySelector('.lz-cover').style.backgroundImage.includes(window._testArt));
  const visible=await page.locator('.lz-cover').evaluate(el=>({display:getComputedStyle(el).display,opacity:getComputedStyle(el,'::after').opacity}));
  assert.notEqual(visible.display,'none');assert.ok(Number(visible.opacity)<=.2,'Artwork is not hidden by the old colour wash');
  await page.screenshot({path:'/tmp/weekly-song-background-perf.png'});
  await page.evaluate(()=>{
    const card=DailyScreen.buildCard({...Daily.data.map,title:'Fixture song',artist:'Fixture artist',version:'4K',keys:4},null,null,[]);
    card.id='fixture-weekly-card';document.querySelector('#app').append(card);
  });
  await page.waitForFunction(()=>document.querySelector('#fixture-weekly-card .dc-cover').style.backgroundImage.includes(window._testArt));
  assert.equal(await page.locator('#fixture-weekly-card').evaluate(el=>Math.abs(el.getBoundingClientRect().height-el.querySelector('.dc-cover').getBoundingClientRect().height)<2),true,'Song background fills the weekly card in performance mode');
  await page.evaluate(()=>document.querySelector('#fixture-weekly-card').remove());
  await page.evaluate(()=>{Daily.data.map={onlineSetId:9876503,onlineId:9876504};HomeScreen.paintDaily();});
  await page.waitForFunction(()=>document.querySelector('.lz-cover').style.backgroundImage.includes('/test-covers/9876503'),null,{timeout:5000});
  // A slow earlier lookup must never replace the current week's artwork.
  const race=await page.evaluate(async()=>{
    const el=document.createElement('div');let release;
    BeatmapManager.bgURL=()=>new Promise(r=>release=r);
    Daily.setArtwork(el,{onlineSetId:9876505,fixtureLocal:true});
    Daily.setArtwork(el,null);
    release(window._testArt);await new Promise(r=>setTimeout(r,0));
    return el.style.backgroundImage;
  });
  assert.equal(race,'');
  await page.evaluate(()=>{Object.assign(Multiplayer,{localMap:window._weeklyOriginal.localMap});BeatmapManager.bgURL=window._weeklyOriginal.bgURL;OnlineBeatmaps.coverURL=window._weeklyOriginal.coverURL;Settings.set('graphics.performanceMode',false);});
  for(const viewport of [{width:844,height:390},{width:640,height:360}]){
    await page.setViewportSize(viewport);await page.evaluate(()=>{HomeScreen.setState('play');HomeScreen._idleAt=performance.now();});await page.waitForTimeout(500);
    assert.equal(await page.locator('.tb-clock').isVisible(),true,'Clock stays available on mobile');
    const r=await page.locator('.tb-clock').boundingBox();assert.ok(r.x>=0 && r.x+r.width<=viewport.width+1,'Clock stays inside screen');
    await page.click('.tb-clock');await page.waitForFunction(()=>Notifications.isOpen());
    await page.keyboard.press('Escape');await page.waitForFunction(()=>!Notifications.isOpen());
  }
  assert.deepEqual(errors,[]);
  console.log('PASS dark pink tabs, clock notifications, matching Back, weekly artwork and performance mode');
} finally {if(browser)await browser.close();server.close();}
