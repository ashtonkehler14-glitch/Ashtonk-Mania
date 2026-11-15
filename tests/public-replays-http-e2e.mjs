// MINIFLARE_DIR=/workspace/work/profile-tools node tests/public-replays-http-e2e.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
const { Miniflare }=createRequire(join(process.env.MINIFLARE_DIR || process.cwd(),'package.json'))('miniflare');
const mf=new Miniflare({modules:true,scriptPath:join(process.cwd(),'worker/index.js'),modulesRoot:process.cwd(),modulesRules:[{type:'ESModule',include:['**/*.js']}],compatibilityDate:'2026-08-01',cf:false,host:'127.0.0.1',port:0,durableObjects:{ROOMS:'MatchRoom',MATCHMAKER:'Matchmaker',VAULT:'PlayerVault'}});
try {
 const url=String(await mf.ready).replace(/\/$/,'');
 const query=new URLSearchParams({pid:'player001',hash:'a'.repeat(64),score:'900000'});
 const missing=await fetch(url+'/api/mp/replay?'+query);
 assert.equal(missing.status,404);
 assert.match((await missing.json()).error,/No shared replay/);
 const unauthorized=await fetch(url+'/api/mp/replay',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({pid:'player001',key:'wrong',hash:'a'.repeat(64),score:900000})});
 assert.equal(unauthorized.status,403);
 console.log('PASS public replay endpoint runs in the worker and enforces account authentication');
}finally{await mf.dispose();}
