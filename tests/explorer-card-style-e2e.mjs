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
  const page = await browser.newPage({ viewport: process.env.CARD_PORTRAIT==='1' ? { width: 390, height: 844 } : { width: 1280, height: 591 }, isMobile: process.env.CARD_TOUCH==='1', hasTouch: process.env.CARD_TOUCH==='1', deviceScaleFactor: 1 }), errors = [];
  await page.addInitScript(() => localStorage.setItem('am.noInstallPrompt', '1'));
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`); await page.waitForFunction(() => document.querySelector('#loading-screen.done'));
  if (await page.$('.onboarding')) {
    if (await page.$('.setup-choice[data-id=new]')) await page.click('.setup-choice[data-id=new]');
    await page.fill('.onboarding .ob-name', 'MobileTester'); await page.keyboard.press('Enter');
    await page.waitForSelector('.setup-step-wom, .setup-step-mobile'); await page.evaluate(() => Onboarding.finish());
  }
  await page.waitForFunction(() => !Screens.busy);
  await page.evaluate(()=>{
    Overlays.closeAll();Settings.set('audio.autoplay',false);
    const names=[['Subwoofer Lullaby','C418'],['Retry Now','Hatsune Miku'],['Final Destination','Camellia']];
    const covers=names.map((_,i)=>{
      const c=document.createElement('canvas');c.width=480;c.height=240;const x=c.getContext('2d');
      const palettes=[['#df9a88','#493779'],['#857cdc','#28245b'],['#b64191','#241838']],p=palettes[i],g=x.createLinearGradient(0,0,0,240);g.addColorStop(0,p[0]);g.addColorStop(1,p[1]);x.fillStyle=g;x.fillRect(0,0,480,240);
      x.fillStyle='#f1bdd0';x.beginPath();x.arc(360,70,37,0,Math.PI*2);x.fill();
      x.fillStyle=p[1];x.beginPath();x.moveTo(0,240);x.lineTo(0,170);x.lineTo(95,100);x.lineTo(210,180);x.lineTo(310,130);x.lineTo(480,190);x.lineTo(480,240);x.fill();return c.toDataURL();
    });
    OnlineBeatmaps.search=async()=>({sets:Array.from({length:30},(_,i)=>({id:i+1,title:names[i%3][0],artist:names[i%3][1],creator:'LeCrazy',status:'ranked',favourites:10,playCount:100,diffs:[{id:i+1,version:'Hard',keys:i%3===2?7:4,stars:3+i%3,length:180,bpm:180,hp:7,od:8,count:800,notes:600,holds:200}]})),hasMore:false,total:30});
    OnlineBeatmaps.loadCover=(el,id,kinds,done,queue)=>{const paint=()=>{el.style.backgroundImage=`url("${covers[(id-1)%3]}")`;done?.();};queue?queue(paint):paint();};
    ExplorerScreen.download=set=>window._downloadPick=set.id;
    ExplorerScreen.togglePreview=id=>window._previewPick=id;
  });
  await page.evaluate(async()=>Screens.go('explore'));await page.waitForFunction(()=>!Screens.busy && document.querySelector('.ex-cardbg.loaded'));await page.waitForTimeout(500);
  const first=page.locator('.explorer .ex-card').first(),side=first.locator('.ex-side');
  if(process.env.CARD_PORTRAIT==='1') {
    assert.ok(await page.locator('.ex-search').isVisible());
    assert.ok(await page.locator('.explorer').evaluate(el=>el.scrollWidth<=el.clientWidth),'Explorer stays within portrait width');
    await page.screenshot({path:'/tmp/explorer-portrait-controls.png'});
  }
  if(process.env.CARD_TOUCH!=='1') {
    await page.mouse.move(0,0);await page.waitForTimeout(250);
    assert.equal(await side.evaluate(el=>getComputedStyle(el).visibility),'hidden','Actions are hidden while idle');
    assert.equal(await first.evaluate(el=>getComputedStyle(el,'::before').borderRadius),'16px');
    assert.equal(await first.locator('.ex-cb').evaluate(el=>getComputedStyle(el).transform),'none','Text stays upright');
    await page.screenshot({path:'/tmp/explorer-artwork-cards-idle.png'});
    await first.hover();await page.waitForTimeout(250);
    assert.equal(await side.evaluate(el=>getComputedStyle(el).visibility),'visible','Hover reveals actions');
    const checkRail=async()=>{
      const fit=await first.evaluate(card=>{
        const rail=card.querySelector('.ex-side'),css=getComputedStyle(rail),shape=getComputedStyle(card,'::before');
        const matrix=new DOMMatrix(css.transform),iconMatrix=new DOMMatrix(getComputedStyle(rail.querySelector('.i')).transform);
        return {rail:css.transform,shape:shape.transform,right:css.right,edge:shape.right,top:rail.offsetTop,height:rail.offsetHeight,cardHeight:card.offsetHeight,iconSkew:matrix.c+iconMatrix.c};
      });
      assert.equal(fit.rail,fit.shape,'Action rail follows the card slant');
      assert.equal(fit.right,fit.edge,'Action rail meets the artwork edge');
      assert.equal(fit.top,0);assert.equal(fit.height,fit.cardHeight,'Action rail fits the card height');
      assert.ok(Math.abs(fit.iconSkew)<0.001,'Action icons stay upright');
    };
    await checkRail();
    await first.getByRole('button',{name:'Like',exact:true}).click();assert.equal(await page.evaluate(()=>ExplorerScreen.liked().has(1)),true);
    await first.getByRole('button',{name:'Download',exact:true}).click();assert.equal(await page.evaluate(()=>window._downloadPick),1);
    assert.equal(await page.locator('.bso').count(),0,'Action clicks do not open the beatmap details');
    await page.screenshot({path:'/tmp/explorer-artwork-cards-hover.png'});
    await page.mouse.move(0,0);
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('.explorer .ex-card .ex-side')).visibility==='hidden');
    assert.equal(await side.evaluate(el=>getComputedStyle(el).visibility),'hidden','Actions disappear when hover ends');
    await first.focus();await page.keyboard.press('Tab');await page.waitForTimeout(250);assert.ok(await page.locator('.ex-card:focus-visible .ex-side, .ex-card:focus-within .ex-side').first().isVisible(),'Keyboard focus reveals actions too');
    const focusedCard=page.locator('.ex-card:focus-visible, .ex-card:focus-within').first();
    await checkRail();
    const focusedId=Number(await focusedCard.getAttribute('data-id'));
    const likedBefore=await page.evaluate(id=>ExplorerScreen.liked().has(id),focusedId);
    await focusedCard.getByRole('button',{name:'Like',exact:true}).focus();await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(id=>ExplorerScreen.liked().has(id),focusedId),!likedBefore,'Enter activates the focused favourite action');
    assert.equal(await page.locator('.bso').count(),0,'Keyboard actions do not trigger the parent card');
    await first.click();
  } else await first.tap();
  await page.waitForSelector('.bso');
  const favourite=page.getByRole('button',{name:'Favourite beatmap',exact:true});assert.ok(await favourite.isVisible(),'Touch users can favourite in beatmap details');
  const was=await favourite.getAttribute('aria-pressed');await favourite.click();assert.equal(await page.getByRole('button',{name:'Favourite beatmap',exact:true}).getAttribute('aria-pressed'),was==='true'?'false':'true');
  await page.evaluate(()=>ExplorerScreen.closeSet());await page.waitForTimeout(300);
  await page.evaluate(()=>Settings.set('graphics.performanceMode',true));await page.waitForTimeout(300);
  assert.equal(await first.evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)','Performance mode keeps the slanted silhouette');
  assert.ok(await first.locator('.ex-thumbwrap').isVisible());
  assert.deepEqual(errors,[]);
  console.log('PASS artwork ribbon cards, hover/focus actions, independent clicks, detail favourites and performance mode '+(process.env.CARD_TOUCH==='1'?'touch':'desktop'));
} finally {if(browser)await browser.close();server.close();}
