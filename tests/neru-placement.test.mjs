import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
function harness() {
  const observers=[],pending=[];
  const ctx=vm.createContext({console,Bus:{on(){}},neruAnim:()=>false,clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),
    ResizeObserver:class {constructor(fn){this.check=fn;this.targets=[];observers.push(this);}observe(el){this.targets.push(el);}disconnect(){this.disconnected=true;}},
    Image:class {constructor(){this.naturalWidth=200;}decode(){return new Promise(r=>pending.push(r));}},
    setInterval:()=>1,clearInterval(){}});
  const src=readFileSync(new URL('../src/js/13b-neru.js',import.meta.url),'utf8');
  vm.runInContext(src.slice(src.indexOf('const NeruCameo ='),src.indexOf("\nBus.on('music:changed'",src.indexOf('const NeruCameo =')))+';globalThis.N=NeruCameo;',ctx);
  return {N:ctx.N,observers,pending};
}
function portrait(){
  const values=new Map(),classes=new Set();
  return {isConnected:true,offsetLeft:20,get offsetWidth(){return 100*(Number(values.get('--nc-fit'))||1);},
    style:{getPropertyValue:k=>values.get(k)||'',setProperty:(k,v)=>values.set(k,v)},
    classList:{toggle(k,on){on?classes.add(k):classes.delete(k);}},classes,
    getAnimations:()=>[],getBoundingClientRect(){const f=Number(values.get('--nc-fit'))||1;return {left:20,bottom:500,height:200*f,width:100*f};}};
}
test('dialog-side Neru stays measurable when cramped and returns after the dialog shrinks',()=>{
  const {N,observers}=harness(),el=portrait(),host={clientWidth:480},dlg={offsetWidth:400};
  N.beside(el,dlg,host);const ro=observers[0];ro.check();
  assert.equal(el.classes.has('nc-cramped'),true);assert.equal(el.offsetWidth,60);
  dlg.offsetWidth=100;ro.check();
  assert.equal(el.classes.has('nc-cramped'),false);assert.equal(el.offsetWidth,100);
  assert.ok(ro.targets.includes(dlg),'Dialog size changes are observed too');
});
test('results-side Neru returns when overlapping panels move away',()=>{
  const {N,observers}=harness(),el=portrait();let left=0;
  const row={isConnected:true,getBoundingClientRect:()=>({left:0,right:1200}),querySelectorAll:()=>[{getBoundingClientRect:()=>({left,right:left+400,top:200,bottom:500,width:400})}],addEventListener(){},removeEventListener(){}};
  N.clearOf(el,row);observers[0].check();assert.equal(el.classes.has('nc-cramped'),true);assert.equal(el.offsetWidth,60);
  left=400;observers[0].check();assert.equal(el.classes.has('nc-cramped'),false);assert.equal(el.offsetWidth,100);
  N.clearOf(el,row);assert.equal(observers[0].disconnected,true,'Switching score panels replaces the old placement watcher');
});
test('a slower old pose cannot overwrite a newer requested pose',async()=>{
  const {N,pending}=harness(),img={src:'initial',parentElement:null},applied=[];
  const old=N.swap(img,'old',()=>applied.push('old')),fresh=N.swap(img,'new',()=>applied.push('new'));
  pending[1]();await fresh;pending[0]();await old;
  assert.equal(img.src,'new');assert.deepEqual(applied,['new']);
});
