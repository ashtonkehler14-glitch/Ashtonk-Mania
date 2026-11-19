// CHROMIUM_PATH=/usr/bin/chromium node tests/home-theme-e2e.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright'), root = new URL('../', import.meta.url);
const reference = execFileSync('git',['show','651ec35:index.html'],{cwd:new URL('../',import.meta.url),maxBuffer:12e6});
const server = createServer((req, res) => {
  const path = req.url.split('?')[0]; if(path==='/reference'){res.setHeader('content-type','text/html');return res.end(reference);} if (path.includes('..')) return res.writeHead(403).end();
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
  const original = await browser.newPage({viewport:{width:1280,height:591},deviceScaleFactor:1});
  original.on('pageerror',e=>errors.push('reference: '+e.message));
  await original.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:'@font-face{font-family:Outfit;font-weight:100 900;src:url(http://127.0.0.1:'+server.address().port+'/fonts/Outfit-Variable.ttf)}'}));
  await original.addInitScript(()=>localStorage.setItem('am.noInstallPrompt','1'));
  await original.goto(`http://127.0.0.1:${server.address().port}/reference`);
  await original.waitForFunction(()=>document.querySelector('#loading-screen.done'));
  if(await original.$('.onboarding')){
    if(await original.$('.setup-choice[data-id=new]'))await original.click('.setup-choice[data-id=new]');
    await original.fill('.onboarding .ob-name','MobileTester');await original.keyboard.press('Enter');
    await original.waitForSelector('.setup-step-wom, .setup-step-mobile');await original.evaluate(()=>Onboarding.finish());
  }
  await original.waitForFunction(()=>!Screens.busy);
  const setup = p=>p.evaluate(()=>{Overlays.closeAll();Settings.set('audio.autoplay',false);Settings.set('ui.scale',.9);Settings.set('graphics.performanceMode',false);Settings.set('ui.menuBackground','skin');Settings.set('ui.mascot',false);HomeScreen._idleAt=performance.now();});
  await original.evaluate(()=>{LowEnd.mark=()=>{};document.documentElement.classList.remove('slow');cssSheet('slow',false);});
  await setup(original);await setup(page);await page.evaluate(()=>Settings.set('ui.gui','og'));
  const snapshot=async(p,selectors)=>p.evaluate(selectors=>Object.fromEntries(selectors.map(sel=>{
    const el=document.querySelector(sel);if(!el)return [sel,null];const cs=getComputedStyle(el),rect=el.getBoundingClientRect();
    return [sel,{style:Object.fromEntries(['backgroundColor','backgroundImage','color','fontFamily','fontSize','fontWeight','borderRadius','borderWidth','padding','gap','transform','boxShadow','display'].map(k=>[k,k==='transform' && cs[k]!=='none' && [1,0,0,1,0,0].every((v,i)=>Math.abs(v-[new DOMMatrix(cs[k]).a,new DOMMatrix(cs[k]).b,new DOMMatrix(cs[k]).c,new DOMMatrix(cs[k]).d,new DOMMatrix(cs[k]).e,new DOMMatrix(cs[k]).f][i])<1e-6) ? 'none' : cs[k]])),rect:[rect.x,rect.y,rect.width,rect.height].map(v=>Math.round(v*10)/10 || 0)}];
  })),selectors);
  for(const state of ['top','play','multi','edit']){
    for(const p of [page,original])await p.evaluate(state=>{HomeScreen.setState(state,true);HomeScreen._idleAt=performance.now();},state);
    await page.waitForTimeout(750);await original.evaluate(()=>document.fonts.ready);
    const selectors=['#toolbar','.tb-ruleset','.tb-left .tb-btn:nth-child(2)','.tb-clock','.lz-logo','.lz-home-disc','.lz-btn.exp','.lz-btn.exp .lz-bg','.lz-btn.exp .lz-label'];
    assert.deepEqual(await snapshot(page,selectors),await snapshot(original,selectors),'OG matches 651ec35 in '+state);
  }
  assert.deepEqual(await page.evaluate(()=>MenuTriangles.col),await original.evaluate(()=>MenuTriangles.col),'Original default triangle color');
  assert.equal(await page.locator('.lz-glass-wave').count(),0);
  assert.equal(await page.locator('.lz-vis').count(),1);
  assert.ok(await page.locator('.lz-btn svg.lzi, .lz-btn svg.fai').count());
  assert.equal(await page.locator('#toolbar svg.phi').count(),0);
  const iconSnapshot=p=>p.evaluate(()=>Object.fromEntries(['gear','home','beatmap','play','heart','download','osulogo','editcircle','mania'].map(name=>{const el=icon(name);return[name,{viewBox:el.getAttribute('viewBox'),path:el.querySelector('path')?.getAttribute('d')||null,masked:el.classList.contains('lzi')}];})));
  assert.deepEqual(await iconSnapshot(page),await iconSnapshot(original),'Original icon assets and view boxes');
  for(const p of [page,original])await p.evaluate(()=>SettingsPanel.open('Skin'));
  await page.waitForTimeout(800);
  for(const p of [page,original])await p.locator('.settings-panel').evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{}))));
  assert.deepEqual(await snapshot(page,['.settings-panel','.sp-nav','.sp-head','.sp-search','.sp-section h3','.sp-group','.set-row']),await snapshot(original,['.settings-panel','.sp-nav','.sp-head','.sp-search','.sp-section h3','.sp-group','.set-row']),'OG settings chrome matches reference');
  await page.screenshot({path:'/tmp/og-651ec35-settings.png'});
  for(const p of [page,original])await p.evaluate(()=>{SettingsPanel.close();HomeScreen.setState('top',true);});
  await page.waitForTimeout(800);await page.screenshot({path:'/tmp/og-651ec35-home.png'});await original.screenshot({path:'/tmp/og-651ec35-reference.png'});
  for(const p of [page,original])await p.evaluate(async()=>{
    OnlineBeatmaps.search=async()=>({sets:Array.from({length:20},(_,i)=>({id:i+1,title:'Song '+i,artist:'Artist',creator:'Mapper',status:'ranked',diffs:[{id:i+1,version:'Hard',keys:4,stars:3,length:180,bpm:180,hp:7,od:8,notes:500,holds:40}],favourites:10,playCount:100})),hasMore:false,total:20});
    OnlineBeatmaps.loadCover=()=>{};await Screens.go('explore');
  });
  await page.waitForTimeout(1200);
  const cards=['.ex-header','.ex-searchwrap','.ex-search','.ex-chip','.ex-grid','.ex-card','.ex-thumbwrap','.ex-card .ex-t','.ex-card .ex-counts','.ex-card .ex-foot','.ex-side-btn'];
  assert.deepEqual(await snapshot(page,cards),await snapshot(original,cards),'Explorer matches the original card and header styles');
  await page.screenshot({path:'/tmp/og-651ec35-explorer.png'});
  assert.deepEqual(errors,[]);console.log('PASS OG matches commit 651ec35 menu layout, typography, colors, toolbar, original icons and settings chrome');
} finally {if(browser)await browser.close();server.close();}
