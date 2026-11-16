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
        if(!document.querySelector('.lz-tri img'))throw Error('Missing triangle background');
        if(document.querySelector('.lz-tipbox, .lz-vis'))throw Error('Removed tips or spectrum bars returned');
        for(const b of buttons){
          if(getComputedStyle(b).color !== 'rgb(255, 255, 255)')throw Error('Home label is not white: '+b.dataset.id);
          const bg=getComputedStyle(b.querySelector('.lz-bg'));
          const isLeft=b.parentElement.classList.contains('lz-left');
          const isEnd=b===buttons.filter(x=>x.parentElement.classList.contains('lz-right')).at(-1);
          if((parseFloat(bg.borderTopLeftRadius)>0)!==isLeft || (parseFloat(bg.borderTopRightRadius)>0)!==isEnd || bg.transform==='none')throw Error('Wrong outer-end rounding: '+b.dataset.id);
          const base=getComputedStyle(b).getPropertyValue('--c').trim();
          if(!isLeft && base==='#3d3745')throw Error('Uncoloured submenu button: '+b.dataset.id);
          if(!b.querySelector('svg.phi path'))throw Error('Missing Phosphor button icon: '+b.dataset.id);
        }
        return actual;
      },state);
      if(['initial','top'].includes(state))await page.screenshot({path:`/tmp/${shotPrefix}-${viewport.width}-${state}.png`});
      console.log(viewport.width,state,result);
    }
  }
  const icons=await page.evaluate(()=>{
    const holder=document.createElement('div');document.body.append(holder);
    try {
      for(const name of Object.keys(ICON_SRC)){
        const svg=icon(name);holder.append(svg);
        if(svg.getAttribute('viewBox')!=='0 0 256 256' || !svg.querySelector('path') || getComputedStyle(svg).stroke!=='none')throw Error('Broken icon '+name);
      }
      if(icon('heart').innerHTML===icon('heart','fill').innerHTML)throw Error('Selected favourite does not change');
      const flat=flatIcon('star',.5);holder.append(flat);
      return {count:holder.querySelectorAll('svg').length,flat:getComputedStyle(flat).backgroundImage};
    }finally{holder.remove();}
  });
  assert.ok(icons.count>=100 && icons.flat.includes('data:image/svg+xml'),'All curated vectors and cached list icons render');
  const clearCentre=await page.evaluate(()=>{
    for(const [width,height] of [[1280,591],[591,1280]]) {
      const cv=document.createElement('canvas');cv.width=width;cv.height=height;
      const ctx=cv.getContext('2d');MenuTriangles.paint(ctx,width,height,[255,.14]);
      for(const y of [.25,.5,.75]) {
        const row=ctx.getImageData(0,Math.floor(height*y),width,1).data;
        const anchor=row.slice(Math.floor(width*.5)*4,Math.floor(width*.5)*4+3);
        for(let px=Math.floor(width*.2);px<width*.8;px++)if(anchor.some((v,c)=>Math.abs(row[px*4+c]-v)>1))return {width,height,px,y,anchor:[...anchor],pixel:[...row.slice(px*4,px*4+3)]};
      }
    }
    return true;
  });
  assert.equal(clearCentre,true,'Triangles stay at the border in landscape and portrait');
  const wave=page.locator('.lz-glass-wave path').first();
  const waveBefore=await wave.getAttribute('d');
  await page.waitForTimeout(180);
  assert.notEqual(await wave.getAttribute('d'),waveBefore,'Logo waves should deform');
  assert.equal(await page.locator('.lz-glass-wave svg').evaluate(el=>getComputedStyle(el).transform),'none','Waves do not slide sideways');
  await page.evaluate(()=>Settings.set('graphics.performanceMode',true));
  let frozen=await wave.getAttribute('d'); await page.waitForTimeout(180);
  assert.equal(await wave.getAttribute('d'),frozen,'Performance mode stops waves');
  await page.evaluate(()=>{Settings.set('graphics.performanceMode',false);Settings.set('ui.animSpeed',0);});
  frozen=await wave.getAttribute('d'); await page.waitForTimeout(180);
  assert.equal(await wave.getAttribute('d'),frozen,'Disabled animations stop waves');
  await page.evaluate(()=>Settings.set('ui.animSpeed',1));
  const musicResponse=await page.evaluate(()=>{
    const playing=Music.playing, analyser=AudioManager.analyser;
    try {
      Music.playing=true; HomeScreen._waveLevel=0;
      AudioManager.analyser={fftSize:512,getFloatTimeDomainData:data=>data.fill(.3)};
      HomeScreen.moveWaves(performance.now()+100);
      return HomeScreen._waveLevel;
    } finally {Music.playing=playing; AudioManager.analyser=analyser;}
  });
  assert.ok(musicResponse>0,'Song volume feeds the wave amplitude');
  const tint=await page.evaluate(async()=>{
    const art=colour=>{const c=document.createElement('canvas');c.width=c.height=12;const x=c.getContext('2d');x.fillStyle=colour;x.fillRect(0,0,12,12);return c.toDataURL();};
    const first=MenuTriangles.fromImage(art('#0066ff'));
    const last=MenuTriangles.fromImage(art('#ff3300'));
    await Promise.all([first,last]);
    const warm=[...MenuTriangles.col];
    await MenuTriangles.fromImage(art('#0066ff'));
    const cool=[...MenuTriangles.col];
    await MenuTriangles.fromImage(null);
    return {warm,cool,base:MenuTriangles.col};
  });
  assert.ok(tint.warm[0]>255 && tint.cool[0]<255,'Artwork changes the background tint and stale samples cannot win');
  for(const colour of [tint.warm,tint.cool])assert.ok(Math.abs(colour[0]-255)<=33 && colour[1]<=.16,'Song tint stays subtle');
  assert.deepEqual(tint.base,[255,.14],'No artwork restores graphite');
  assert.deepEqual(errors,[]);
  console.log('PASS unchanged home navigation and reachable buttons on desktop/mobile');
} finally {if(browser)await browser.close();server.close();}
