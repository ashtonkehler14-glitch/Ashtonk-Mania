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
    Overlays.closeAll();Settings.set('songselect.lbScope','local');Settings.set('ui.animSpeed',0);
    const records=Array.from({length:70},(_,i)=>({id:'score-'+i,passed:true,player:'Player '+i,score:(70-i)*10000,scoreStd:(70-i)*10000,accuracy:.9,maxCombo:100}));
    ScoreManager.forMap=()=>records;
    const score={scoreStd:0,score:0,judged:1,accuracy:1,combo:0,maxCombo:0};
    const G=GameplayScreen;G.hud=h('div.gp-hud');document.getElementById('app').append(G.hud);G.s={mode:'play',rec:{hash:'fixture'},engine:{score},mp:null,running:false};G._hudAll=false;
    G.buildLeaderboard();
    const snap=()=>({shown:G.lbEl.querySelectorAll('.hud-mp-row').length,rank:G._lbMe.pos.textContent,mounted:G._lbRows.filter(r=>r.panel).length,labels:[...G.lbEl.querySelectorAll('.pos')].map(e=>e.textContent)});
    const bottom=snap();score.scoreStd=350001;score.judged++;G.updateLeaderboard(true);const middle=snap();score.scoreStd=350000;G.updateLeaderboard(true);const tie=snap();
    G.lbEl._full=false;score.scoreStd=800000;G.updateLeaderboard(true);const top=snap();
    Multiplayer.me='p0';Multiplayer.room={settings:{win:'score'},players:Array.from({length:12},(_,i)=>({id:'p'+i,name:'Player '+i}))};
    Multiplayer.opps=new Map(Array.from({length:11},(_,i)=>['p'+(i+1),{score:(11-i)*10000,acc:1,maxCombo:20}]));
    G.s.mp={players:Multiplayer.room.players.map(p=>p.id)};G._mpRows=null;G.mpBoard=h('div.hud-mp');G.hud.append(G.mpBoard);score.scoreStd=0;G._mpDrawn=0;G.updateMp(G.s.engine);
    const mpBottom={visible:G._mpRows.filter(r=>!r.el.hidden).length,rank:G._mpRows.find(r=>r.me).pos.textContent,hidden:G._mpRows.find(r=>r.me).el.hidden};
    score.scoreStd=200000;G._mpDrawn=0;G.updateMp(G.s.engine);const mpTop={visible:G._mpRows.filter(r=>!r.el.hidden).length,rank:G._mpRows.find(r=>r.me).pos.textContent,hidden:G._mpRows.find(r=>r.me).el.hidden};
    return {bottom,middle,tie,top,mpBottom,mpTop};
  });
  for(const state of [result.bottom,result.middle,result.tie,result.top]){assert.equal(state.shown,5);assert.equal(state.mounted,4);}
  assert.equal(result.bottom.rank,'#71');assert.equal(result.middle.rank,'#36');assert.equal(result.tie.rank,'#37');assert.equal(result.top.rank,'#1');
  assert.deepEqual(result.middle.labels,['#34','#35','#36','#37','#38']);
  assert.deepEqual(result.mpBottom,{visible:5,rank:'#12',hidden:false});assert.deepEqual(result.mpTop,{visible:5,rank:'#1',hidden:false});
  await page.screenshot({path:'/tmp/gameplay-leaderboard-window.png'});
  assert.deepEqual(errors,[]);console.log('PASS bounded live leaderboard rows, full-list ranks, ties, compact climbing and multiplayer position window');
} finally {if(browser)await browser.close();server.close();}
