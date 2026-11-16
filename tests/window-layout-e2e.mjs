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
  await page.evaluate(()=>{Overlays.closeAll();Settings.set('audio.autoplay',false);HomeScreen.setState('top');});
  for (const viewport of [{width:650,height:1100},{width:430,height:900},{width:800,height:1000},{width:1280,height:720},{width:844,height:390}]) {
    await page.setViewportSize(viewport); await page.evaluate(()=>{HomeScreen.setState('top');HomeScreen._idleAt=performance.now();}); await page.waitForTimeout(850);
    if(viewport.width<viewport.height) assert.ok(await page.evaluate(()=>1/Zoom.z>=.58),'Tall windows keep a readable scale');
    for(const btn of await page.locator('.lz-btn.exp').all()) {
      const b=await btn.boundingBox();assert.ok(b && b.x>=-1 && b.y>=-1 && b.x+b.width<=viewport.width+1 && b.y+b.height<=viewport.height+1,JSON.stringify({viewport,b}));
    }
    await page.screenshot({path:`/tmp/window-home-${viewport.width}x${viewport.height}.png`});
    await page.evaluate(()=>WhatsNew.show([CHANGELOG[0]]));await page.waitForTimeout(400);
    const dialog=await page.locator('.cl').boundingBox();assert.ok(dialog.x>=0 && dialog.y>=0 && dialog.x+dialog.width<=viewport.width+1 && dialog.y+dialog.height<=viewport.height+1);
    if(viewport.width===650) assert.ok(dialog.width>450,'Changelog uses available portrait width');
    await page.evaluate(()=>Overlays.closeAll());
    for(const name of ['beatmaps','collections','explore','profile','rankings','multiplayer']) {
      await page.evaluate(async name=>Screens.go(name),name);await page.waitForFunction(()=>!Screens.busy);await page.waitForTimeout(400);
      const panel=await page.locator('.screen.menu-surface:not(.leave)').boundingBox();assert.ok(panel && panel.x>0 && panel.y>0 && panel.x+panel.width<viewport.width && panel.y+panel.height<viewport.height, name+' '+JSON.stringify(viewport));
      const toolbar=await page.locator('#toolbar').boundingBox();
      assert.ok(Math.abs(panel.x+panel.width/2-viewport.width/2)<1,'Menu stays centred: '+name);
      assert.ok(Math.abs(panel.width-toolbar.width)<1,'Menu matches toolbar width: '+name);
      if(viewport.width===650 && name==='collections') await page.screenshot({path:'/tmp/floating-collections-portrait.png'});
    }
    await page.evaluate(()=>SettingsPanel.open());await page.waitForTimeout(350);
    const settings=await page.locator('.settings-panel').boundingBox(),toolbar=await page.locator('#toolbar').boundingBox();
    assert.ok(Math.abs(settings.x+settings.width/2-viewport.width/2)<1,'Settings stays centred');
    assert.ok(Math.abs(settings.width-toolbar.width)<1,'Settings shares the large menu width');
    await page.evaluate(()=>SettingsPanel.close());
    await page.evaluate(async()=>Screens.go('home'));await page.waitForFunction(()=>!Screens.busy);
  }
  assert.deepEqual(errors,[]);
  console.log('PASS readable tall desktop windows, home controls, changelog and floating menu bounds at five sizes');
} finally {if(browser)await browser.close();server.close();}
