// CHROMIUM_PATH=/usr/bin/chromium node tests/chat-message-actions-e2e.mjs
import assert from 'node:assert/strict';
import {PresenceLogic} from '../worker/multiplayer.js';
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
  await page.evaluate(gui=>Settings.set('ui.gui',gui),process.env.GUI_MODE || 'default');
  const pid=await page.evaluate(()=>Presence.pid()),logic=new PresenceLogic(()=>Date.now());
  logic.join('a',{pid,name:'ActionTester',key:'a'.repeat(32)});logic.join('b',{pid:'bobbbbb1',name:'Bob',key:'b'.repeat(32)});logic.makeFriends(pid,'ActionTester','offline1','Offline Friend');
  await page.exposeFunction('actionMessage',packet=>logic.message('a',packet));
  await page.evaluate(()=>{
    Overlays.closeAll();Presence.start=()=>{};Presence.refresh=()=>{};Presence.me='a';Presence.ws={readyState:1,send(){}};
    Friends.server=[{pid:'offline1',name:'Offline Friend',online:false}];
    Presence.send=packet=>{window._sendDone=window.actionMessage(packet).then(out=>{for(const e of out)if(e.to==='all' || e.to==='a'){if(e.msg.scope==='spectator' || e.msg.t.startsWith('specChat'))SpectatorChat.on(e.msg);else if(['say','chatChange','chatHist','pmHist','offlineMentions'].includes(e.msg.t))Chat.on(e.msg);}});};
    Chat.open('#lobby');
  });
  const input=page.getByRole('textbox',{name:'Chat message',exact:true});
  await input.fill('original message');await input.press('Enter');await page.evaluate(()=>window._sendDone);
  await page.locator('.ch-line.chat-own-message').hover();await page.getByRole('button',{name:'Message actions',exact:true}).click();
  await page.locator('.menu button').filter({hasText:/^Edit message$/}).click();
  const edited='Edited '+('long message '.repeat(12));await page.locator('.pd-input').fill(edited);await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.chat-edited'));
  assert.equal(logic.chat[0].text,edited.trim());assert.ok(edited.length>60,'Editor supports normal chat-length messages');
  await page.locator('.ch-line.chat-own-message').hover();await page.getByRole('button',{name:'Message actions',exact:true}).click();await page.locator('.menu button').filter({hasText:/^Delete message$/}).click();await page.getByRole('button',{name:'Delete',exact:true}).waitFor({timeout:5000}).catch(async e=>{await page.screenshot({path:'/tmp/chat-delete-failure.png'});console.log(await page.locator('.dialog,.menu').allTextContents());throw e;});await page.getByRole('button',{name:'Delete',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('.ch-line.chat-own-message'));assert.equal(logic.chat[0].deleted,true);
  const other=logic.message('b',{t:'say',text:'someone else'}).find(e=>e.msg.t==='say').msg;await page.evaluate(m=>Chat.on(m),other);
  assert.equal(await page.locator('.ch-line .chat-message-actions').count(),0,'Other people’s messages have no edit/delete menu');
  await input.fill('hey @Off');await page.getByRole('option').first().waitFor();assert.ok((await page.getByRole('option').first().textContent()).includes('Offline'));
  await input.press('Enter');assert.equal(await input.inputValue(),'hey @Offline Friend ');await input.press('Enter');await page.evaluate(()=>window._sendDone);
  assert.equal(logic.mentionInbox.get('offline1').length,1,'Offline mention is queued');
  const persisted=JSON.parse(JSON.stringify(logic.chat));await page.evaluate(list=>{Chat.on({t:'chatHist',list});},persisted);assert.equal(await page.getByText('original message',{exact:true}).count(),0);
  logic.message('b',{t:'watch',to:'a',chat:true});
  await page.evaluate(()=>{Chat.close();Spectate.host.watchers=1;SpectatorChat.refresh();SpectatorChat.open();});
  const specInput=page.getByRole('textbox',{name:'Spectator chat message'});await specInput.fill('spectator message');await specInput.press('Enter');await page.evaluate(()=>window._sendDone);
  await page.locator('.spectator-chat .chat-own-message').hover();await page.locator('.spectator-chat').getByRole('button',{name:'Message actions'}).click();await page.locator('.menu button').filter({hasText:/^Edit message$/}).click();await page.locator('.pd-input').fill('updated spectator message');await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.spectator-chat .chat-edited'));assert.equal(logic.users.get('a').specLines[0].text,'updated spectator message');
  await page.screenshot({path:'/tmp/chat-message-actions.png'});
  assert.deepEqual(errors,[]);
  console.log('PASS own message edit/delete, full-length edits, ownership UI, reconnect history, offline suggestions/notifications and spectator editing');
} finally {if(browser)await browser.close();server.close();}
