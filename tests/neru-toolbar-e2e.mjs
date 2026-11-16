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
  const retired=await page.evaluate(()=>{
    const previous=Settings.get('medals.unlocked');
    try {
      Settings.set('medals.unlocked',{'neru-seasons':Date.now(),'neru-pat':Date.now()});
      const available=Medals.all.some(m=>/season/i.test(m.id+' '+m.name+' '+m.desc));
      return {available,counted:Medals.has('neru-seasons'),kept:Medals.has('neru-pat')};
    }finally{Settings.set('medals.unlocked',previous||{});}
  });
  assert.deepEqual(retired,{available:false,counted:false,kept:true});
  for(const month of [0,3,6,9]) {
    await page.evaluate(async month=>{
      const original=NeruEggs.today;
      try {NeruEggs.today=()=>new Date(2026,month,15,23);await Screens.go('home',{force:true});}
      finally{NeruEggs.today=original;}
    },month);
    await page.waitForFunction(()=>NeruMascot.img && NeruMascot.img.isConnected);
    await page.waitForTimeout(600);
    assert.equal(await page.locator('.neru-drift, .neru-ground, .neru-sky, .nd-shoot').count(),0,'No weather or night-star layers');
  }
  for(const viewport of [{width:1280,height:591},{width:844,height:390},{width:640,height:360}]){
    await page.setViewportSize(viewport);
    await page.evaluate(()=>{HomeScreen.setState('top');HomeScreen._idleAt=performance.now();});
    await page.waitForTimeout(950);
    const frame=await page.locator('#toolbar').evaluate(el=>{const r=el.getBoundingClientRect(),css=getComputedStyle(el);return {left:r.left,right:r.right,width:innerWidth,radius:parseFloat(css.borderBottomLeftRadius),topRadius:parseFloat(css.borderTopLeftRadius)};});
    assert.ok(frame.left>0 && frame.right<frame.width && frame.radius>=8 && frame.topRadius===0,'Toolbar is inset and rounded');
    const clock=await page.locator('.tb-clock').boundingBox();assert.ok(clock.x>=frame.left && clock.x+clock.width<=frame.right+1,'Toolbar clock stays inside frame');
    assert.equal(await page.locator('#toolbar .tb-ruleset, #toolbar [data-icon="bell"]').count(),0,'Redundant bell and ruleset selector removed');
    await page.click('.tb-clock');await page.waitForFunction(()=>Notifications.isOpen());
    const visibleTime=await page.locator('.tb-clock .tb-time').evaluate(el=>({text:el.textContent,z:getComputedStyle(el).zIndex,visibility:getComputedStyle(el).visibility}));
    assert.match(visibleTime.text,/\d{2}:\d{2}:\d{2} (AM|PM)/);assert.equal(visibleTime.visibility,'visible');assert.ok(Number(visibleTime.z)>0,'Clock text paints above its selected highlight');
    await page.keyboard.press('Escape');await page.waitForFunction(()=>!Notifications.isOpen());
    await page.screenshot({path:`/tmp/simple-neru-${viewport.width}.png`});
    if(viewport.width===1280){
      await page.click('#toolbar [data-ov="settings"]');await page.waitForSelector('.settings-panel');await page.waitForTimeout(650);
      await page.screenshot({path:'/tmp/settings-before-bubbly.png'});
      await page.evaluate(()=>SettingsPanel.close());await page.waitForTimeout(250);
    }
  }
  assert.deepEqual(errors,[]);
  console.log('PASS simple Neru across seasons/night, retired seasonal medals, and rounded inset toolbar on mobile');
} finally {if(browser)await browser.close();server.close();}
