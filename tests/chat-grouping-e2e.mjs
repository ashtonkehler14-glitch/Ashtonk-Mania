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
  await page.evaluate(()=>{
    Overlays.closeAll();Settings.set('audio.autoplay',false);
    Presence.ws={readyState:1,send(){}};Presence.send=()=>{};
    const base=Date.now()-600000;
    window.groupFixtures=[['Alice',0],['Alice',1000],['Alice',2000],['Bob',3000],['Alice',4000],['Alice',305000],['system',306000],['Alice',307000]].map(([name,delta],i)=>({from:{pid:'fixture-'+name,name},text:'Message '+(i+1),at:base+delta}));
    Chat.channels.get('#lobby').lines=[];Chat.open('#lobby');
    for(const line of groupFixtures) { if(line.from.name==='system')Chat.local(line.text);else Chat.on({t:'say',...line}); }
    UserPanels.profile=u=>window._openedChatProfile=u.pid;
  });
  const lines=page.locator('.ch-lines .ch-line');
  assert.equal(await lines.count(),8,'All messages remain present');
  assert.equal(await page.locator('.ch-line.chat-continuation').count(),2,'Only adjacent same-speaker messages group');
  assert.equal(await lines.nth(1).locator('.chat-avatar').isVisible(),false);
  await lines.first().locator('.chat-avatar').click();assert.equal(await page.evaluate(()=>window._openedChatProfile),'fixture-Alice');
  await page.evaluate(()=>Chat.paint());assert.equal(await page.locator('.ch-line.chat-continuation').count(),2,'History repaint preserves grouping');
  await page.screenshot({path:'/tmp/grouped-lobby-chat.png'});
  await page.evaluate(()=>{
    Chat.close();SpectatorChat.context=()=>({id:'fixture-host',name:'Alice',host:true});SpectatorChat.refresh();
    SpectatorChat.lines=groupFixtures.filter(l=>l.from.name!=='system');SpectatorChat.open();
  });
  assert.equal(await page.locator('.spectator-chat .chat-continuation').count(),3);
  assert.equal(await page.locator('.spectator-chat .gp-chat-l').count(),7);
  await page.screenshot({path:'/tmp/grouped-spectator-chat.png'});
  const trim=await page.evaluate(()=>{
    const list=h('div');for(let i=0;i<6;i++)list.append(groupChatLine(list,compactChatLine('div.gp-chat-l',{pid:'Alice',name:'Alice'},'line '+i),{pid:'Alice',name:'Alice'},Date.now()+i));
    trimChatLines(list,3);return {count:list.children.length,firstGrouped:list.firstChild.classList.contains('chat-continuation'),followingGrouped:list.lastChild.classList.contains('chat-continuation')};
  });
  assert.deepEqual(trim,{count:3,firstGrouped:false,followingGrouped:true},'Pruning promotes the first remaining line to a visible header');
  assert.deepEqual(errors,[]);
  console.log('PASS chat grouping, speaker/time/system boundaries, preserved messages, profile links, repaint and pruning');
} finally {if(browser)await browser.close();server.close();}
