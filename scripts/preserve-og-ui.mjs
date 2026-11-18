// Reproduce OG presentation assets from the user-selected revision. Run with Node from any directory.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const root=new URL('../',import.meta.url).pathname.replace(/\/$/,'');
const git=p=>execFileSync('git',['show','651ec35:'+p],{cwd:root,encoding:'utf8',maxBuffer:12e6});
const {chromium}=createRequire(root+'/package.json')('playwright');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const page=await browser.newPage();
const result=await page.evaluate(({oldCSS,modern,home,ui})=>{
 const obj=(src,name)=>{const start=src.indexOf('const '+name+' = {')+('const '+name+' = ').length;let end=start;while((end=src.indexOf('\n};',end+1))>=0){let f;try{f=Function('return ('+src.slice(start,end+2)+')');}catch{continue;}return f();}throw Error('Missing object '+name);};
 const H=obj(home,'HomeScreen'),T=obj(ui,'Toolbar'),M=obj(home,'MenuTriangles'),L=obj(home,'LogoPainter');
 const methods=(o,keys)=>keys.map(k=>typeof o[k]==='function'?o[k].toString():k+': '+JSON.stringify(o[k])).join(',\n');
 // Keep the historical sheet intact. Supplemental rules only style components added since this revision.
 oldCSS=oldCSS.replace(/\/\*@sheet [\w-]+\*\/[\s\S]*?\/\*@end\*\//g,'');
 const legacy=new CSSStyleSheet();legacy.replaceSync(oldCSS);
 const current=new CSSStyleSheet();current.replaceSync(modern.replace(/\/\*@sheet [\w-]+\*\/[\s\S]*?\/\*@end\*\//g,''));
 const split=s=>{let depth=0,start=0,out=[];for(let i=0;i<s.length;i++){if('(['.includes(s[i]))depth++;if(')]'.includes(s[i]))depth--;if(s[i]===','&&!depth){out.push(s.slice(start,i).trim());start=i+1;}}out.push(s.slice(start).trim());return out;};
 const selectors=new Set(), classes=new Set();const collect=rules=>{for(const r of rules)if(r.type===1)split(r.selectorText).forEach(s=>{selectors.add(s);for(const m of s.matchAll(/\.([a-zA-Z_][\w-]*)/g))classes.add(m[1]);});else if(r.cssRules&&r.type!==7)collect(r.cssRules);};collect(legacy.cssRules);
 const supplement=r=>{
  if(r.type===1){const ss=split(r.selectorText).filter(s=>!selectors.has(s)&&[...s.matchAll(/\.([a-zA-Z_][\w-]*)/g)].some(m=>!classes.has(m[1]))&&!/:has\(|\.slow\b|menu-surface|full-screen-menu|\.lz-|#toolbar|\.tb-|\.sp-|settings-panel|:root|^html|^body|^\*/.test(s));return ss.length?ss.join(', ')+' { '+r.style.cssText+' }':'';}
  if(r.cssRules&&![7,8].includes(r.type)){const body=[...r.cssRules].map(supplement).filter(Boolean).join('\n');return body?r.cssText.slice(0,r.cssText.indexOf('{')+1)+'\n'+body+'\n}':'';}return '';
 };
 return {css:oldCSS,supplement:[...current.cssRules].map(supplement).filter(Boolean).join('\n'),home:methods(H,['buildLogo','loop','buttonDefs','showTip','TIPS','TOUCH_TIPS']),clock:methods(T,['CLOCK_MODES','buildClock','cycleClock','use24h','tick','turn','updateBell']),triangle:M.paint.toString(),arrays:JSON.stringify({OUTLINE:M.OUTLINE,SOLID:M.SOLID,RING:M.RING}),logoSrc:L.SRC};
},{oldCSS:git('src/styles.css'),modern:readFileSync(root+'/src/styles.css','utf8'),home:git('src/js/13-screen-home.js'),ui:git('src/js/12-ui-core.js')});
// Preserve original animation/geometry; don't restore the retired automatic low-power override.
result.home=result.home.replace(/      \/\/ a slow device[\s\S]*?      const lite = !!this\._slow;/,'      const lite = false;');
result.home=result.home.replace('setTimeout(() => this.onBeat(L), 60)', 'setTimeout(() => { if (this.el?.isConnected) this.onBeat(L); }, 60)');
let icons=git('src/js/12-icons.js').replace(/\bICON_IMG\b/g,'OG_ICON_IMG').replace(/\bICON_SRC\b/g,'OG_ICON_SRC');
const js=`/* Preserved presentation from Git commit 651ec35. Gameplay and data use the current client. */\n${icons}\nconst OG_REFERENCE = {\n home: {${result.home}},\n clock: {${result.clock}},\n triangles: {...${result.arrays}, ${result.triangle}},\n logoSource: ${JSON.stringify(result.logoSrc)}\n};\n`;
writeFileSync(root+'/src/js/12i-og-reference.js',js);
writeFileSync(root+'/src/styles-og.css','/* Original UI stylesheet from Git commit 651ec35, with current-feature compatibility below.\n   The Default stylesheet is disabled while this sheet is active; modern styling cannot leak into OG. */\n@font-face { font-family:Outfit;font-style:normal;font-weight:100 900;font-display:swap;src:url(fonts/Outfit-Variable.ttf) format("truetype"); }\n'+result.css+'\n/* Components added after 651ec35 retain their functionality. */\n'+result.supplement+'\n.sp-neru-peek { display:none; }\n.ex-card-placeholder { height:100px;margin-inline:0;border-radius:10px;transform:none; }\n');
await browser.close();
