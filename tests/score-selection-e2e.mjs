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
  const result=await page.evaluate(()=>{
    Overlays.closeAll();const map={id:'map-id',hash:'map-hash',setId:'set-id',title:'MTC',artist:'S3RL',version:'4K HD',creator:'Mapper',keys:4,stars:2.56};
    const local={id:'exact-local',mapHash:map.hash,score:534702,scoreStd:534702,maxCombo:258,accuracy:.8473,mods:['SD'],counts:[505,609,298,96,22,45],date:1000,grade:'B',pp:0,replayId:'right-replay',passed:true};
    const online={...local,id:'o-player',pid:'other-player',online:true,own:true,replayId:null};
    const forMap=ScoreManager.forMap,go=Screens.go,panel=MpResults.panel,centre=ResultsScreen.recentre,byHash=BeatmapManager.mapByHash;
    let opened;let root;
    try {
      ScoreManager.forMap=()=>[{...local,id:'wrong-play',date:999},local];Screens.go=(name,params)=>{opened=params.score;};
      SongSelect.lbScore(online,0,'Tester',map).click();const exact=opened.id==='exact-local' && opened.replayId==='right-replay';
      online.own=false;SongSelect.lbScore(online,0,'Tester',map).click();const foreign=opened.mapHash===map.hash && opened.version===map.version && opened.pid==='other-player';
      ScoreManager.forMap=()=>[];BeatmapManager.mapByHash=()=>map;MpResults.panel=r=>h('button',r.name);ResultsScreen.recentre=()=>{};
      const card=h('div.rs'),grid=h('div.res-grid',card);root=h('div.res-body',grid);document.getElementById('app').append(root);
      MpResults.solo={grid,card,s:opened};MpResults.boards.set(map.hash,{scores:[{pid:'other-player',name:'Other',date:1000,score:534702,acc:.8473,combo:258,mods:['SD'],counts:local.counts,grade:'B'}]});
      MpResults.paintLocal();return {exact,foreign,duplicates:grid.querySelectorAll('.res-mp-side button').length};
    } finally {ScoreManager.forMap=forMap;Screens.go=go;MpResults.panel=panel;ResultsScreen.recentre=centre;BeatmapManager.mapByHash=byHash;MpResults.solo=null;root?.remove();}
  });
  assert.ok(result.exact && result.foreign,'Actual score-row clicks open the correct saved play or remote score');assert.equal(result.duplicates,0,'The selected remote play is not repeated beside itself');
  assert.deepEqual(errors,[]);console.log('PASS clicked score identity, exact replay selection and no duplicate selected online score');
} finally {if(browser)await browser.close();server.close();}
