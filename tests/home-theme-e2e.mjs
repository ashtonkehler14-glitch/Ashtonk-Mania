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


  await page.evaluate(()=>{while(Overlays.top())Overlays.top().close();Settings.set('ui.menuBackground','triangles');});
  const shotPrefix=process.env.SHOT_PREFIX || 'home-after';
  for (const viewport of [{width:1440,height:900},{width:1280,height:591},{width:844,height:390}]) {
    await page.setViewportSize(viewport);
    for(const state of ['initial','top','play','multi','edit']) {
      await page.evaluate(state=>{HomeScreen.setState(state);HomeScreen._idleAt=performance.now();},state);
      await page.waitForTimeout(950);
      const result=await page.evaluate(state=>{
        const expected={initial:[],top:['settings','play','edit','browse'],play:['back','solo','multi','daily'],multi:['back','lounge','ranked'],edit:['back','beatmaps','skin']};
        const buttons=[...document.querySelectorAll('.lz-btn.exp')];
        const actual=buttons.map(b=>b.dataset.id);
        if(JSON.stringify(actual)!==JSON.stringify(expected[state]))throw Error('Menu buttons changed '+state+': '+actual);
        for(const b of buttons){const r=b.getBoundingClientRect();if(r.left<0||r.right>innerWidth+2||r.top<0||r.bottom>innerHeight+2)throw Error('Button clipped '+b.dataset.id);}
        if(!document.querySelector('.menu-triangles, .menu-tri, .mt-bg, canvas'))throw Error('Missing background');
        return actual;
      },state);
      if(['initial','top'].includes(state))await page.screenshot({path:`/tmp/${shotPrefix}-${viewport.width}-${state}.png`});
      console.log(viewport.width,state,result);
    }
  }
  assert.deepEqual(errors,[]);
  console.log('PASS unchanged home navigation and reachable buttons on desktop/mobile');
} finally {if(browser)await browser.close();server.close();}
