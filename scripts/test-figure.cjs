const assert=require('node:assert/strict');
const engineModule={exports:{}};
new Function('module',require('node:fs').readFileSync('app/draw-engine.js','utf8'))(engineModule);
const E=engineModule.exports.FigureDrawEngine;
const ips=[{id:'a',prizes:[{name:'figure',kind:'figure'},{name:'gift',kind:'participation'},{name:'hidden',kind:'figure',hidden:true}]}];
const stock={a:[2,8,20]};
function rng(...values){return ()=>values.shift()??0;}
let hit=E.draw(ips,stock,10,rng(.099,0));
assert.equal(hit.kind,'figure');assert.deepEqual(hit.stock.a,[1,8,20]);assert.deepEqual(stock.a,[2,8,20]);
assert.equal(E.draw(ips,stock,10,rng(.1,0)).kind,'participation');
assert.equal(E.draw(ips,stock,0,rng(0,0)).kind,'participation');
assert.equal(E.draw(ips,stock,100,rng(.999,.999)).kind,'figure');
assert.equal(E.draw(ips,{a:[0,8,20]},10,rng(0,0)).kind,'participation');
assert.equal(E.availability(ips,{a:[2,0,20]},10).ok,false);
assert.equal(E.availability(ips,{a:[2,0,20]},100).ok,true);
assert.equal(E.availability(ips,{a:[0,8,20]},100).ok,false);
assert.equal(E.availability(ips,stock,NaN).ok,false);
const bundles=[{id:'b',prizes:[{kind:'figure',subs:[{name:'one'},{name:'two'}]}]}];
hit=E.draw(bundles,{b:[[1,3]]},100,rng(0,.25));assert.equal(hit.sub,1);assert.deepEqual(hit.stock.b,[[1,2]]);
let counts={figure:0,participation:0};for(let i=0;i<1000;i++)counts[E.draw(ips,stock,17.5,rng(i/1000,.5)).kind]++;
assert.deepEqual(counts,{figure:175,participation:825});
console.log('PASS: probability boundaries, category exhaustion, hidden prizes, weighted bundles, immutable inventory');
assert.equal(E.availability(ips,{a:[2,0,20]}).ok,true);
assert.equal(E.availability(ips,{a:[0,8,20]}).ok,true);
assert.equal(E.availability(ips,{a:[0,0,20]}).ok,false);
assert.equal(E.draw(ips,stock,null,rng(.199)).kind,'figure');
assert.equal(E.draw(ips,stock,null,rng(.2)).kind,'participation');
assert.equal(E.draw(ips,{a:[2,0,20]},null,rng(.99)).kind,'figure');
hit=E.draw(bundles,{b:[[1,3]]},null,rng(.25));assert.equal(hit.sub,1);
let remaining=structuredClone(stock),awards={figure:0,participation:0};
for(let i=0;i<10;i++){hit=E.draw(ips,remaining,null,rng(.4));remaining=hit.stock;awards[hit.kind]++;}
assert.deepEqual(awards,{figure:2,participation:8});assert.deepEqual(remaining.a,[0,0,20]);
assert.throws(()=>E.draw(ips,remaining),/소진/);
console.log('PASS: default stock weighting, single-category continuation and full visible inventory depletion');

const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync('app/index.html','utf8');
const inline=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
new vm.Script(inline);new vm.Script(fs.readFileSync('app/figure.js','utf8'));new vm.Script(fs.readFileSync('app/choose-screen.js','utf8'));new vm.Script(fs.readFileSync('app/transition.js','utf8'));new vm.Script(fs.readFileSync('app/idle-video.js','utf8'));
new vm.Script(fs.readFileSync('app/result-video.js','utf8'));
// Execute the real draw commit in isolation: failed persistence must not consume inventory.
const src=fs.readFileSync('app/figure.js','utf8');
const commit=src.slice(src.indexOf('function commitFigureDraw()'),src.indexOf('function revealScroll()'));
const context={FigureDrawEngine:E,cfg:{ips},stock:structuredClone(stock),logArr:[],activeFigurePercent:()=>100,figureProbabilityEnabled:()=>true,nextSerial:()=>1,selectedScroll:3,K_STATE:'state',localStorage:{setItem(){throw Error('quota');}},curIp:null,lastResult:null};
vm.createContext(context);vm.runInContext(src.slice(src.indexOf("function figureDrawPolicy()"),src.indexOf("function figureAvailable()"))+commit,context);assert.throws(()=>context.commitFigureDraw(),/quota/);assert.deepEqual(context.stock,stock);assert.equal(context.logArr.length,0);assert.equal(context.lastResult,null);
let written;context.localStorage.setItem=(k,v)=>{written=JSON.parse(v);};context.commitFigureDraw();assert.equal(written.stock.a[0],1);assert.equal(written.log.length,1);assert.equal(written.log[0].scrollNumber,4);assert.equal(context.lastResult.kind,'figure');
console.log('PASS: atomic inventory/log commit and storage failure leaves draw untouched');
const sw=fs.readFileSync('app/sw.js','utf8');const assets=[...sw.matchAll(/'\.\/([^']+)'/g)].map(m=>m[1].split('?')[0]);for(const asset of assets)assert.ok(fs.existsSync('app/'+asset),asset);
assert.ok(html.includes('figure.js'));assert.ok(html.includes('scr-scrolls'));assert.ok(html.includes('scr-open'));
console.log('PASS: script syntax, screen integration and precached asset paths');



const start=Date.parse('2026-09-14T10:00:00+09:00'),duration=24*60000;
const config={figureCooldownEnabled:true,cooldownMin:20,figureIntervalEnabled:true,figureIntervalMin:24,figureIntervalStart:new Date(start).toISOString(),figureIntervalSeed:'test-seed'};
for(const i of [0,4,5,1000]){
 const release=E.intervalRelease(config,i);assert.ok(release>=start+i*duration&&release<start+(i+1)*duration);
 assert.equal(E.timeGate(config,[],release-1).blocked,true);assert.equal(E.timeGate(config,[],release).guaranteed,true);
 const wins=[{kind:'figure',timestamp:new Date(Math.ceil(release)).toISOString()}];assert.equal(E.timeGate(config,wins,Math.ceil(release)+1).blocked,true);
 assert.equal(E.intervalRelease(JSON.parse(JSON.stringify(config)),i),release);
}
assert.equal(E.timeGate(config,[],start-1).blocked,true);
assert.equal(E.timeGate({...config,figureIntervalSeed:''},[],start).blocked,true);
const wins=[{kind:'figure',timestamp:new Date(start).toISOString()}];
assert.equal(E.timeGate({...config,figureIntervalEnabled:false},wins,start+19*60000).blocked,true);
assert.equal(E.timeGate({...config,figureIntervalEnabled:false},wins,start+20*60000).blocked,false);
console.log('PASS: unlimited intervals, stable release times, one winner per interval and cooldown');

// Three grades: 상급 (figure) alone is under probability; 일반 (normal) shares the stock pool with 참가상.
{
  const E=require('../app/draw-engine.js').FigureDrawEngine;
  const ips=[{id:'a',prizes:[{kind:'figure'},{kind:'normal'},{kind:'participation'}]}];
  const stock={a:[1,3,1]};
  assert.equal(E.kindOf({tier:'high'}),'figure');assert.equal(E.kindOf({kind:'normal'}),'normal');
  let seq=[0.99,0.5];const rng=()=>seq.shift();
  let hit=E.draw(ips,stock,10,rng);assert.equal(hit.kind,'normal'); // 0.99 misses the 10% 상급 roll; 0.5*4 lands in 일반 (3 of 4)
  seq=[0.05,0];hit=E.draw(ips,stock,10,rng);assert.equal(hit.kind,'figure');
  assert.deepEqual(E.availability(ips,{a:[1,0,0]},50),{ok:false,reason:'일반·참가상 재고를 준비해주세요.'});
  assert.equal(E.availability(ips,{a:[0,2,0]},50).ok,true,'일반 alone keeps the probability mode running');
  const all={a:[0,0,0]};const counts={figure:0,normal:0,participation:0};let left={a:[2,3,5]};
  while(E.availability(ips,left,null).ok){const h=E.draw(ips,left,null);counts[h.kind]++;left=h.stock;}
  assert.deepEqual(counts,{figure:2,normal:3,participation:5});void all;
  console.log('PASS: 상급 probability with 일반+참가상 stock pool, 일반-only availability, three-grade depletion');
}
