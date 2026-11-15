// CHROMIUM_PATH=/usr/bin/chromium node tests/mobile-column-alignment-e2e.mjs
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
  const page = await browser.newPage({ viewport: { width: 1280, height: 591 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }), errors = [];
  await page.addInitScript(() => localStorage.setItem('am.noInstallPrompt', '1'));
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`); await page.waitForFunction(() => document.querySelector('#loading-screen.done'));
  if (await page.$('.onboarding')) {
    if (await page.$('.setup-choice[data-id=new]')) await page.click('.setup-choice[data-id=new]');
    await page.fill('.onboarding .ob-name', 'MobileTester'); await page.keyboard.press('Enter');
    await page.waitForSelector('.setup-step-wom, .setup-step-mobile'); await page.evaluate(() => Onboarding.finish());
  }
  await page.waitForFunction(() => !Screens.busy);


  for(const viewport of [{width:1280,height:591},{width:844,height:390},{width:360,height:740}]) {
    await page.setViewportSize(viewport);
    for(const scale of [.75,1.25]) {
      await page.evaluate(scale=>{Settings.set('ui.scale',scale);Settings.set('graphics.renderScale',scale===.75?.5:1);},scale);
      await page.evaluate(()=>{
        while(Overlays.top())Overlays.top().close();
        showMenu(innerWidth-10,innerHeight-12,[{header:'Add to collection'},...Array.from({length:100},(_,i)=>({label:'My practice collection '+i,icon:'folder',checked:i===0}))],{above:true});
      });
      await page.waitForTimeout(400);
      await page.evaluate(()=>{
        const menu=document.querySelector('.menu:not(.out)'),r=menu.getBoundingClientRect();
        if(r.left<0||r.top<0||r.right>innerWidth+1||r.bottom>innerHeight+1)throw Error('Menu out of bounds '+JSON.stringify(r));
        if(menu.scrollHeight<=menu.clientHeight)throw Error('Long menu should scroll');
      });
    }
  }
  await page.evaluate(async()=>{
    while(Overlays.top())Overlays.top().close();
    const oldName=Screens.currentName;Screens.currentName='gameplay';
    let online=true;
    Toast.show('Offline friend fixture','Must not appear',{hold:true,valid:()=>online});
    online=false;Screens.currentName='results';Bus.emit('screen:changed');
    await new Promise(r=>setTimeout(r,1200));
    if([...document.querySelectorAll('.toast')].some(e=>e.textContent.includes('Offline friend fixture')))throw Error('Stale friend toast appeared');
    Screens.currentName=oldName;
    if(Settings.get('audio.hitSounds')!==false)throw Error('Hit sounds must default off');
    let stopCount=0;
    const leaving={_failSound:{stop(){stopCount++;}},closePause(){}};
    GameplayScreen.leave.call(leaving);
    if(stopCount!==1||leaving._failSound!==null)throw Error('Fail source was not stopped');
    const oldSample=SkinManager.sample, oldPlay=AudioManager.play;
    let hits=0;
    SkinManager.sample=async()=>({});AudioManager.play=()=>{hits++;};
    const session={engine:{score:{combo:1}},debug:{}}, fake={s:session,_tok:{},renderer:{onJudgement(){}},adaptHit(){}};
    const event={type:'judgement',j:0,err:null,tail:false};
    try {
      GameplayScreen.onEngineEvent.call(fake,event);await Promise.resolve();
      if(hits!==0)throw Error('Disabled hit sounds played');
      Settings.set('audio.hitSounds',true);
      GameplayScreen.onEngineEvent.call(fake,event);await Promise.resolve();
      if(hits!==1)throw Error('Enabled hit sound did not play');
    }finally{Settings.set('audio.hitSounds',false);SkinManager.sample=oldSample;AudioManager.play=oldPlay;}

  });
  assert.deepEqual(errors,[]);
  console.log('PASS scaled collection menus and stale friend suppression');
} finally {if(browser)await browser.close();server.close();}
