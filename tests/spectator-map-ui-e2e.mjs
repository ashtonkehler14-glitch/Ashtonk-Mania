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
  let mode='exact';const sum='a'.repeat(32);
  await page.route('**/api/lookupBeatmap?**',route=>route.fulfill({status:mode==='missing'?404:200,contentType:'application/json',body:JSON.stringify({checksum:sum,setId:42,beatmapId:8})}));
  await page.evaluate(async sum=>{
    Overlays.closeAll();Settings.set('audio.autoplay',false);Settings.set('online.autoDownload',false);
    Presence.ws={readyState:1,send(){}};Presence.send=()=>{};
    Spectate.target={id:'host',pid:'hostpid',name:'Player',status:'playing',room:false};
    Spectate.cur={id:'host',name:'Player',head:{mapHash:'original',stars:6.37,checksum:sum,onlineId:123,onlineSetId:999,title:'Exact Song',artist:'Artist',version:'Hard',keys:4},feed:[],at:100,ready:true,ended:false,acts:[]};
    OnlineBeatmaps.loadCover=(el,id,kinds,done)=>{el.style.backgroundImage='linear-gradient(120deg,#9b306b,#8c32ed)';done?.();};
    await Screens.go('spectator');
  },sum);
  await page.waitForFunction(()=>!Screens.busy && Spectate.cur?.lookup?.state==='exact');
  assert.equal(await page.getByRole('button',{name:'Download exact beatmap',exact:true}).count(),1);
  assert.equal(await page.getByRole('button',{name:'Start Watching',exact:true}).isDisabled(),true);
  assert.equal((await page.locator('.spm-card .stars').textContent()).trim(),'6.37','Spectator card shows the played rating');
  const chat=await page.locator('.spectator-chat').boundingBox(),song=await page.locator('.spm-stage').boundingBox();
  assert.ok(song.x>=chat.x+chat.width,'Song panel does not overlap chat');
  for (const viewport of [{width:1280,height:591},{width:844,height:390},{width:390,height:844}]) {
    await page.setViewportSize(viewport);
    for (const scale of [.75,1.25,1.75]) {
      await page.evaluate(scale=>{Settings.set('ui.scale',scale);Zoom.update();SpectatorChat.refresh();},scale);
      await page.waitForTimeout(80);
      const fit=await page.evaluate(()=>{
        const panel=SpectatorChat.panel,stage=SpectatorScreen.stage,chat=panel.getBoundingClientRect(),song=stage.getBoundingClientRect();
        return {chat:{x:chat.x,y:chat.y,right:chat.right,bottom:chat.bottom},song:{x:song.x,bottom:song.bottom},scaled:Math.abs(chat.width-panel.offsetWidth/Zoom.z)<2,inApp:panel.parentElement===document.getElementById('app'),overflow:stage.scrollWidth>stage.clientWidth+1};
      });
      assert.ok(fit.inApp && fit.scaled,'Persistent chat uses the same scaling container as menus');
      assert.ok(fit.chat.x>=0 && fit.chat.y>=0 && fit.chat.right<=viewport.width+1 && fit.chat.bottom<=viewport.height+1,'Chat stays inside the viewport at every UI scale');
      assert.ok(viewport.width>viewport.height?fit.song.x>=fit.chat.right:fit.song.bottom<=fit.chat.y+1,'Chat and song details occupy separate space');
      assert.equal(fit.overflow,false,'Song details do not scroll sideways');
    }
  }
  await page.setViewportSize({width:1280,height:process.env.CARD_TOUCH==='1'?390:591});
  await page.evaluate(()=>{Settings.set('ui.scale',1.25);Zoom.update();});
  await page.screenshot({path:process.env.CARD_TOUCH==='1'?'/tmp/spectate-exact-mobile.png':'/tmp/spectate-exact-desktop.png'});
  await page.evaluate(()=>{
    ExplorerScreen.download=async()=>{BeatmapManager.maps.set('modified',{id:'modified',hash:'different',onlineId:8,osuPath:'modified',problems:[]});};
    BeatmapManager.getFile=async()=>new Blob(['modified bytes']);
  });
  await page.getByRole('button',{name:'Download exact beatmap',exact:true}).click();await page.waitForFunction(()=>Spectate.cur.lookup.state==='mismatch');
  assert.equal(await page.getByRole('button',{name:'Start Watching',exact:true}).isDisabled(),true);
  assert.ok(await page.getByText('The available download is a different revision',{exact:true}).isVisible());
  mode='missing';
  await page.evaluate(()=>{Spectate.cur={...Spectate.cur,head:{...Spectate.cur.head,mapHash:'next',onlineSetId:999},lookup:null,downloadAttempted:false};Spectate.autoDownload();});
  await page.waitForFunction(()=>Spectate.cur.lookup.state==='missing');
  assert.equal(await page.getByRole('button',{name:'Download exact beatmap',exact:true}).count(),0);
  assert.ok(await page.getByText('Exact beatmap not found',{exact:true}).isVisible());
  assert.deepEqual(errors,[]);
  console.log('PASS exact lookup/download status, no chat overlap, wrong revision rejected and no guessed downloads');
} finally {if(browser)await browser.close();server.close();}
