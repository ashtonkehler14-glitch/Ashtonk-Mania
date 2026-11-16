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
    Presence.ws={readyState:1,send(){}};
    Presence.players=[{id:'key',pid:'keyboard-player',name:'Keyboard Murderer'},{id:'keru',pid:'keru-player',name:'Keru'}];
    Presence.send=m=>{window._sentMention=m;};
    Chat.open('#lobby');
  });
  const input=page.getByRole('textbox',{name:'Chat message',exact:true});
  await input.fill('hello @key');
  await page.getByRole('listbox',{name:'Mention a player'}).waitFor();
  assert.equal(await page.getByRole('option').count(),1);
  await page.keyboard.press('Enter');
  assert.equal(await input.inputValue(),'hello @Keyboard Murderer ');
  assert.notEqual(await page.evaluate(()=>window._sentMention?.t),'say','Choosing a suggestion does not send');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>window._sentMention.text.trim()),'hello @Keyboard Murderer');
  await input.fill('@ke');await page.keyboard.press('ArrowDown');await page.keyboard.press('Tab');
  assert.ok((await input.inputValue()).startsWith('@'));
  assert.equal(await page.getByRole('listbox').count(),0);
  await input.fill('@key');await page.getByRole('option').first().click();
  assert.equal(await input.inputValue(),'@Keyboard Murderer ');
  await input.fill('@ke');await page.keyboard.press('Escape');assert.equal(await page.getByRole('listbox').count(),0);assert.equal(await input.inputValue(),'@ke');
  await input.fill('@zzz-no-player');assert.equal(await page.getByRole('listbox').count(),0);
  const result=await page.evaluate(()=>{
    const captures=[],old=Toast.show;Toast.show=(title,text,opts)=>captures.push({title,text,hold:opts.hold});
    Settings.set('online.status','online');
    const text='hello @'+ProfileManager.profile.name+'!';
    Multiplayer.onMessage({t:'chat',from:'remote',pid:'other-player',name:'Friend',text,ts:Date.now()});
    SpectatorChat.context=()=>({id:'fixture-host',name:'Host',host:true});SpectatorChat.refresh();
    SpectatorChat.on({t:'specChat',id:'fixture-host',line:{from:{pid:'other-player',name:'Friend'},text,at:Date.now()}});
    const active=captures.slice();
    ChatMentions.notify({from:{pid:Presence.pid(),name:'Self'},text},'chat',()=>{});
    Settings.set('online.status','dnd');ChatMentions.notify({from:{pid:'other-player',name:'Friend'},text},'chat',()=>{});
    const unchanged=captures.length===active.length;
    Settings.set('online.status','online');Toast.show=old;
    return {active,unchanged,exact:ChatMentions.has('@Annabelle','Ann'),special:ChatMentions.has('hi @A+B!','A+B'),spaces:ChatMentions.has('@Keyboard Murderer hello','Keyboard Murderer')};
  });
  assert.equal(result.active.length,2,'Room and spectator messages notify');
  assert.ok(result.active.every(n=>n.hold),'Mention popups wait until the song ends');
  assert.equal(result.unchanged,true,'Self mentions and Do not disturb do not notify');
  assert.equal(result.exact,false);assert.equal(result.special,true);assert.equal(result.spaces,true);
  assert.deepEqual(errors,[]);
  console.log('PASS @ autocomplete, keyboard/touch selection, send separation, notification delivery, DND and name boundaries');
} finally {if(browser)await browser.close();server.close();}
