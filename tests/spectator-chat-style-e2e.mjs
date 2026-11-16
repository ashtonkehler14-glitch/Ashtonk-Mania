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
    SpectatorChat.context=()=>({id:'fixture-host',name:'Keyboard Murderer',host:true});
    Presence.ws={readyState:1,send(){}};
    Presence.send=m=>{if(m.t==='specChat')window._sentChat=m;};
    SpectatorChat.refresh();
    SpectatorChat.lines=Array.from({length:24},(_,i)=>({from:{pid:'fixture-player-'+i,name:i%2?'Ashtonk101':'Keyboard Murderer'},text:i===23?'A longer message that wraps naturally without pushing the input or send button off the edge. '.repeat(3):'That was a great run!',at:Date.now()}));
    SpectatorChat.open();
  });
  const panel=page.locator('.spectator-chat');
  await panel.waitFor();
  const bounds=await panel.boundingBox();
  assert.ok(bounds.x>=0 && bounds.y>=0 && bounds.x+bounds.width<=page.viewportSize().width && bounds.y+bounds.height<=page.viewportSize().height,'Panel fits the viewport');
  assert.ok(await page.getByRole('button',{name:'Send spectator message'}).isVisible());
  assert.ok(await panel.locator('.gp-chat-list').evaluate(el=>el.scrollHeight>el.clientHeight),'Long history scrolls inside the panel');
  assert.ok(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth),'Messages do not overflow horizontally');
  await page.screenshot({path:process.env.CARD_TOUCH==='1'?'/tmp/spectator-chat-polished-touch.png':'/tmp/spectator-chat-polished.png'});
  await page.getByRole('textbox',{name:'Spectator chat message'}).fill('Nice play!');
  await page.getByRole('button',{name:'Send spectator message'}).click();
  assert.equal(await page.evaluate(()=>window._sentChat.text),'Nice play!');
  assert.equal(await page.getByRole('textbox',{name:'Spectator chat message'}).inputValue(),'');
  await page.getByRole('button',{name:'Close spectator chat'}).click();
  assert.equal(await panel.count(),0);
  await page.evaluate(()=>{
    Spectate.target={id:'fixture-viewed',name:'Friend',room:false};
    SpectatorChat.context=()=>Spectate.target ? {id:'fixture-viewed',name:'Friend',host:false}:null;
    SpectatorChat.refresh();
  });
  assert.equal(await panel.count(),1,'Viewer chat opens automatically');
  assert.equal(await page.getByRole('button',{name:'Close spectator chat'}).count(),0,'Viewer chat stays open');
  await page.getByRole('textbox',{name:'Spectator chat message'}).focus();await page.keyboard.press('Escape');
  assert.equal(await panel.count(),1,'Escape leaves viewer chat open');
  assert.equal(await page.getByRole('textbox',{name:'Spectator chat message'}).evaluate(el=>el===document.activeElement),false,'Escape releases typing focus');
  await page.evaluate(()=>{MainMenus.close();Spectate._launching=true;Bus.emit('screen:changed','gameplay');});
  assert.equal(await panel.count(),1,'Chat survives screen transitions');
  await page.evaluate(()=>{
    document.querySelector('#app').append(Spectate.liveEl({spectate:{name:'Friend'},rec:{title:'Test Song'}}));
  });
  const bar=await page.locator('.spec-live').boundingBox();
  assert.ok(bar.width>page.viewportSize().width*.95 && bar.y<2,'Watching strip spans the top');
  assert.equal(await page.locator('.spec-live .spec-msg').count(),0);
  await page.evaluate(()=>{Spectate.target=null;SpectatorChat.refresh();document.querySelector('.spec-live').remove();});
  assert.equal(await panel.count(),0,'Chat closes when watching stops');
  assert.deepEqual(errors,[]);
  console.log('PASS spectator chat wrapping, scroll, viewport bounds, sending and close');
} finally {if(browser)await browser.close();server.close();}
