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
  await page.evaluate(()=>{Overlays.closeAll();Settings.set('audio.autoplay',false);ModSelect.open();});
  await page.waitForSelector('.modsel');
  await page.waitForTimeout(400);
  const result=await page.evaluate(()=>{
    const cols=ModSelect.colsEl,buttons=[...cols.querySelectorAll('.mod-p')];const selected=buttons.find(b=>b.textContent.includes('Double Time'));selected.focus();
    const opening=cols.getAnimations({subtree:true}).filter(a=>a.effect.getKeyframes().some(f=>f.opacity===0)).length;
    cols.scrollLeft=120;const before=cols.scrollLeft;
    ModSelect.toggle('DT');ModSelect.toggle('HT');ModSelect.toggle('RT');
    return {same:cols===ModSelect.colsEl && buttons.every((b,i)=>b===ModSelect.colsEl.querySelectorAll('.mod-p')[i]),focused:document.activeElement===selected,scroll:cols.scrollLeft===before,flashing:!!document.querySelector('.ms-cust.flash'),opening,pressed:[...cols.querySelectorAll('.mod-p[aria-pressed="true"]')].map(b=>b.textContent)};
  });
  assert.ok(result.same && result.focused && result.scroll,'Mod changes retain buttons, focus and horizontal scroll');assert.equal(result.flashing,false);assert.equal(result.opening,0);
  assert.ok(result.pressed.some(t=>t.includes('Song Speed')) && !result.pressed.some(t=>t.includes('Double Time')),'Incompatible speed mods still replace each other');
  const preset=await page.evaluate(()=>{
    Settings.set('mods.presets',[{id:'fixture',name:'Fast',mods:['DT'],config:ModSystem.config()}]);ModSelect.render();
    const button=ModSelect.colsEl.querySelector('.preset');button.click();const on=(Settings.get('songselect.mods') || []).includes('DT');button.click();
    return {on,off:!(Settings.get('songselect.mods') || []).length,same:button===ModSelect.colsEl.querySelector('.preset')};
  });
  assert.ok(preset.on && preset.off && preset.same,'A retained preset button can be toggled on and off repeatedly');
  await page.locator('.ms-search-in').fill('half');assert.equal(await page.locator('.modcol:not(.mod-presets) .mod-p').count(),1,'Search still rebuilds only the matching choices');
  assert.deepEqual(errors,[]);console.log('PASS stable mod controls, focus, scroll, incompatibilities and search');
} finally {if(browser)await browser.close();server.close();}
