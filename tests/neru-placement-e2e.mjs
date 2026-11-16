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
  await page.evaluate(()=>{Overlays.closeAll();Settings.set('audio.autoplay',false);Settings.set('ui.mascot',true);});
  for(const viewport of [{width:1280,height:591},{width:844,height:390}]) {
    await page.setViewportSize(viewport);await page.evaluate(()=>SettingsPanel.open());
    await page.waitForSelector('.sp-neru-peek:not([hidden])');await page.waitForTimeout(600);
    const settings=await page.locator('.settings-panel').boundingBox(),neru=await page.locator('.sp-neru-peek').boundingBox();
    assert.ok(settings.x<30 && settings.width<viewport.width*.9,'Settings is a compact left sidebar');
    assert.ok(neru.x+neru.width>settings.x+settings.width && neru.x+neru.width<viewport.width,'Neru peeks around the sidebar edge inside the viewport');
    assert.equal(await page.locator('.sp-neru-peek').evaluate(el=>getComputedStyle(el).pointerEvents),'none','Neru never blocks sidebar or backdrop clicks');
    assert.equal(await page.locator('.sp-wrap > .backdrop').evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(12, 9, 18, 0.48)');
    await page.screenshot({path:`/tmp/settings-neru-sidebar-${viewport.width}.png`});
    if(viewport.width===1280) {
      await page.evaluate(()=>Settings.set('ui.mascot',false));assert.equal(await page.locator('.sp-neru-peek').count(),0);
      await page.evaluate(()=>Settings.set('ui.mascot',true));await page.waitForSelector('.sp-neru-peek:not([hidden])');
      await page.evaluate(()=>Dialog.popup('Layer check','This dialog must stay above settings.',[{label:'Continue',cls:'ok'}]));
      await page.getByRole('button',{name:'Continue',exact:true}).click();await page.waitForTimeout(250);
      assert.equal(await page.locator('.settings-panel').count(),1,'Nested dialogs close without covering or dismissing settings');
    }
    await page.evaluate(()=>SettingsPanel.close());await page.waitForTimeout(400);
    assert.equal(await page.locator('.sp-neru-peek').count(),0,'Neru leaves with the sidebar');
  }
  await page.evaluate(()=>NeruEggs.peek('list',{found:false,alongside:true}));await page.waitForSelector('.nc-peek:not([hidden])');
  for(const viewport of [{width:1280,height:591},{width:844,height:390}]) {
    await page.setViewportSize(viewport);await page.waitForTimeout(150);
    assert.ok(await page.locator('.nc-peek').evaluate(el=>el.offsetHeight<=innerHeight*.34+1),'Body-level peeks use the physical viewport rather than app zoom');
  }
  assert.deepEqual(errors,[]);
  console.log('PASS settings sidebar, dimmed backdrop, non-blocking Neru peek and correctly scaled temporary peeks');
} finally {if(browser)await browser.close();server.close();}
