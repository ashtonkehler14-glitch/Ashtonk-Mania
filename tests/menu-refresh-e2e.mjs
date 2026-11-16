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


  await page.evaluate(()=>{Overlays.closeAll();HomeScreen.setState('top');HomeScreen._idleAt=performance.now();Settings.set('audio.autoplay',false);});
  assert.equal(await page.evaluate(()=>Settings.get('ui.menuBackground')),'beatmap');
  await page.waitForSelector('.lz-tri img');
  const fixture=readFileSync(new URL('fixtures/test-set.osz',import.meta.url)).toString('base64');
  await page.evaluate(async data=>{const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));const report=await BeatmapManager.importFiles([new File([bytes],'fixture.osz')]);if(!report.sets.length)throw Error(report.errors.join());},fixture);
  await page.waitForFunction(()=>Background.current && !document.querySelector('.home > .lz-tri'));
  const exported=await page.evaluate(async()=>{
    const keep=window.downloadBlob;window.downloadBlob=(blob,name)=>window._beatmapPack={blob,name};
    try{await DataManager.exportAll();}finally{window.downloadBlob=keep;}
    const zip=await ZipReader.fromFile(window._beatmapPack.blob);
    return {name:window._beatmapPack.name,files:zip.entries.map(e=>e.name),hashes:[...BeatmapManager.maps.values()].map(m=>m.hash).sort()};
  });
  assert.match(exported.name,/beatmaps-.*\.zip$/);assert.ok(exported.files.some(n=>n.endsWith('.osu')) && exported.files.some(n=>n.endsWith('.wav')) && exported.files.some(n=>n.endsWith('.png')));
  assert.ok(!exported.files.some(n=>/scores|replays|settings|profile|medals/i.test(n)));
  await page.evaluate(async()=>BeatmapManager.clearAll());await page.waitForSelector('.home > .lz-tri');
  await page.evaluate(async()=>{const report=await BeatmapManager.importFiles([new File([window._beatmapPack.blob],'beatmaps.zip')]);if(!report.sets.length)throw Error(report.errors.join());});
  await page.waitForFunction(()=>!document.querySelector('.home > .lz-tri'));
  assert.deepEqual(await page.evaluate(()=>[...BeatmapManager.maps.values()].map(m=>m.hash).sort()),exported.hashes,'Beatmap backup round-trips through the real importer');
  await page.evaluate(async()=>Screens.go('profile'));await page.waitForFunction(()=>!Screens.busy && Screens.currentName==='profile');
  await page.evaluate(async()=>Screens.go('explore'));await page.waitForFunction(()=>!Screens.busy && Screens.currentName==='explore');
  await page.evaluate(()=>Screens.back());await page.waitForFunction(()=>!Screens.busy && Screens.currentName==='home');
  assert.deepEqual(await page.evaluate(()=>Screens.history),[],'Closing a menu goes Home, not back to an older profile');
  await page.evaluate(()=>{HomeScreen.setState('top');HomeScreen._idleAt=performance.now();});await page.waitForTimeout(700);
  // Controls continue working inside the new grouped settings layout.
  await page.click('#toolbar [data-ov="settings"]');await page.waitForSelector('.settings-panel');
  assert.ok(await page.locator('.sp-group-card').count()>5);
  const before=await page.evaluate(()=>Settings.get('skin.beatmapSkins'));
  await page.getByRole('switch',{name:'Beatmap skins',exact:true}).click();
  assert.equal(await page.evaluate(()=>Settings.get('skin.beatmapSkins')),!before);
  await page.getByRole('button',{name:'Revert Beatmap skins to default',exact:true}).click();
  assert.equal(await page.evaluate(()=>Settings.get('skin.beatmapSkins')),true);
  await page.fill('.sp-search','master volume');await page.waitForTimeout(150);
  assert.ok((await page.locator('.sp-section').count())<=1);
  await page.fill('.sp-search','');
  for(const viewport of [{width:1280,height:591},{width:844,height:390}]){
    await page.setViewportSize(viewport);await page.waitForTimeout(300);
    const bounds=await page.locator('.settings-panel').boundingBox();assert.ok(bounds.x>=0 && bounds.y>=0 && bounds.x+bounds.width<=viewport.width+1 && bounds.y+bounds.height<=viewport.height+1);
    await page.screenshot({path:`/tmp/floating-settings-${viewport.width}.png`});
  }
  await page.evaluate(()=>NowPlaying.show());
  assert.equal(await page.evaluate(()=>!!SettingsPanel.o),false);
  await page.evaluate(()=>Notifications.open());assert.equal(await page.evaluate(()=>NowPlaying.open),false);
  await page.evaluate(()=>SettingsPanel.open());assert.equal(await page.evaluate(()=>Notifications.isOpen()),false);
  await page.evaluate(async()=>Screens.go('explore'));assert.equal(await page.evaluate(()=>!!SettingsPanel.o),false);
  await page.evaluate(async()=>Screens.go('home'));await page.waitForFunction(()=>!Screens.busy);
  // Spectator messages share the gameplay classes and sit at the lower left for watchers and hosts.
  await page.evaluate(()=>{
    window._spectatorFixture={ws:Presence.ws,send:Presence.send,target:Spectate.target,hostWatchers:Spectate.host.watchers,me:Presence.me};
    window._sentSpec=[];Presence.ws={readyState:1};Presence.send=m=>window._sentSpec.push(m);
    Spectate.target={id:'fixture-host',name:'Friend'};SpectatorChat.open();
    SpectatorChat.on({t:'specChatLine',id:'fixture-host',line:{from:{pid:'friend-id',name:'Friend'},text:'hello from the player',at:Date.now()}});
  });
  await page.getByRole('textbox',{name:'Spectator chat message'}).fill('hello from spectator');await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>window._sentSpec.at(-1).text),'hello from spectator');
  assert.ok(await page.locator('.spectator-chat .gp-chat-l').count()>0);
  for(const viewport of [{width:1280,height:591},{width:844,height:390},{width:640,height:360}]){
    await page.setViewportSize(viewport);await page.waitForTimeout(150);
    const bounds=await page.locator('.spectator-chat').boundingBox();assert.ok(bounds.x<=20 && bounds.y+bounds.height<=viewport.height && bounds.x+bounds.width<viewport.width);
    assert.ok(viewport.height-bounds.y-bounds.height<=22,'Chat hugs the lower left corner');
    await page.screenshot({path:`/tmp/spectator-gameplay-chat-${viewport.width}.png`});
  }
  const persistent=await page.evaluate(()=>{const panel=SpectatorChat.panel;Spectate._launching=true;Bus.emit('screen:changed','gameplay');return panel===SpectatorChat.panel;});assert.equal(persistent,true);
  await page.evaluate(()=>{SpectatorChat.close();Spectate.target=null;Spectate.host.watchers=1;Presence.me='fixture-self';SpectatorChat.open();});
  assert.equal(await page.locator('.spectator-chat').count(),1,'Player receives the same chat UI');
  await page.evaluate(()=>{SpectatorChat.close();const old=window._spectatorFixture;Presence.ws=old.ws;Presence.send=old.send;Presence.me=old.me;Spectate.target=old.target;Spectate.host.watchers=old.hostWatchers;SpectatorChat.refresh();});
  assert.deepEqual(errors,[]);
  console.log('PASS floating settings, exclusive menus, beatmap defaults/fallback, real beatmap backup round trip and spectator gameplay chat');
} finally {if(browser)await browser.close();server.close();}
