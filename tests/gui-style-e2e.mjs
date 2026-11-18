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
  await page.evaluate(()=>{Overlays.closeAll();Settings.set('audio.autoplay',false);Settings.set('ui.menuBackground','skin');HomeScreen.setState('top');});
  await page.waitForTimeout(600);
  const initial=await page.evaluate(()=>({gui:Settings.get('ui.gui'),sheet:document.getElementById('css-og').media,font:getComputedStyle(document.body).fontFamily,paint:MenuTriangles.paint.toString(),color:getComputedStyle(document.querySelector('.lz-btn[data-id=play]')).getPropertyValue('--c').trim()}));
  assert.equal(initial.gui,'default');assert.equal(initial.sheet,'not all');assert.ok(initial.font.includes('Sora'));
  await page.evaluate(()=>SettingsPanel.open('User Interface'));await page.locator('.sp-search').fill('GUI');
  const control=page.locator('.settings-panel select[aria-label="GUI"]');
  assert.deepEqual(await control.locator('option').allTextContents(),['Default','OG']);
  await control.evaluate(el=>{el.value='og';el.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.waitForFunction(()=>document.documentElement.classList.contains('og-ui'));
  await page.waitForFunction(()=>document.querySelector('.lz-tri img') && document.querySelector('.lz-tri img').complete);
  assert.equal(await page.evaluate(()=>document.getElementById('css-og').media),'all');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.lz-btn[data-id=play]')).getPropertyValue('--c').trim()),'#6644cc');
  assert.ok(await page.evaluate(()=>getComputedStyle(document.body).fontFamily.includes('Outfit')));
  await page.evaluate(()=>SettingsPanel.close());await page.waitForTimeout(400);await page.screenshot({path:'/tmp/gui-og-desktop.png'});
  await page.evaluate(async()=>{await Settings.flush();});await page.reload();await page.waitForFunction(()=>document.querySelector('#loading-screen.done') && !Screens.busy);
  assert.equal(await page.evaluate(()=>Settings.get('ui.gui')),'og','GUI selection survives restarting');
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.gui),'og');
  await page.evaluate(()=>{OnlineBeatmaps.search=async()=>({sets:Array.from({length:20},(_,i)=>({id:i+1,title:'Song '+i,artist:'Artist',creator:'Mapper',status:'ranked',diffs:[{id:i+1,version:'Hard',keys:4,stars:3,length:180,bpm:180,hp:7,od:8,notes:500,holds:40}],favourites:10,playCount:100})),hasMore:false,total:20});OnlineBeatmaps.loadCover=(el,id,kinds,done)=>done?.();});
  for(const viewport of [{width:1280,height:591},{width:844,height:390},{width:390,height:844}]){
    await page.setViewportSize(viewport);
    await page.evaluate(async()=>{await Screens.go('explore');SettingsPanel.open('User Interface');});
    await page.waitForTimeout(750);
    const fits=await page.locator('.settings-panel').evaluate(el=>{const r=el.getBoundingClientRect();return r.x>=-1 && r.right<=innerWidth+1 && r.y>=-1 && r.bottom<=innerHeight+1 && el.scrollWidth<=el.clientWidth+1;});if(!fits){await page.screenshot({path:'/tmp/og-fit-failure.png'});console.log(await page.locator('.settings-panel').evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height,sw:el.scrollWidth,cw:el.clientWidth,zoom:Zoom.z,css:getComputedStyle(el).cssText};}));}assert.ok(fits,'OG settings remain accessible at '+JSON.stringify(viewport));
    await page.evaluate(()=>SettingsPanel.close());await page.waitForTimeout(250);
    assert.equal(await page.evaluate(()=>Screens.current.el.classList.contains('menu-surface')),false,'OG menus use their original full-screen layout');
    assert.ok(await page.locator('.explorer').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
    await page.evaluate(async()=>{await Screens.go('home');});
  }
  await page.setViewportSize({width:1280,height:591});
  await page.evaluate(()=>{Settings.set('ui.gui','default');HomeScreen.setState('top');});await page.waitForTimeout(600);
  const restored=await page.evaluate(()=>({sheet:document.getElementById('css-og').media,font:getComputedStyle(document.body).fontFamily,paint:MenuTriangles.paint.toString(),color:getComputedStyle(document.querySelector('.lz-btn[data-id=play]')).getPropertyValue('--c').trim()}));
  assert.equal(restored.sheet,'not all');assert.equal(restored.paint,initial.paint);assert.equal(restored.color,initial.color);assert.equal(restored.font,initial.font);
  await page.screenshot({path:'/tmp/gui-default-restored.png'});
  assert.deepEqual(errors,[]);console.log('PASS Default/OG settings control, immediate reversible switch, persisted selection, original colors/fonts/artwork and mobile menu bounds');
} finally {if(browser)await browser.close();server.close();}
