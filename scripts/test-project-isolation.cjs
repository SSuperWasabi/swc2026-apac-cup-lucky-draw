// No real operator data: DOM/IDB/cache stand-ins and a synthetic legacy backup.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {JSDOM}=require('../.tools/node_modules/jsdom');
const prefix='swc2026-apac-lucky-draw';
const html=fs.readFileSync('app/index.html','utf8');
const dom=new JSDOM(html,{url:'https://example.test/swc2026-apac-cup-lucky-draw/app/',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window,run=code=>vm.runInContext(code,dom.getInternalVMContext());
const oldKeys=['config.v1','stock.v1','log.v1','cooldown.v1','draw-state.v1'];
const before={};
for(const key of oldKeys){const name='figure-draw.'+key;before[name]=JSON.stringify({sentinel:key});w.localStorage.setItem(name,before[name]);}
const opened=[];
w.indexedDB={open:(name)=>{opened.push(name);return {};}}; // Leave async boot pending, as in the inherited DOM test.
w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;
w.matchMedia=()=>({matches:true});
for(const method of ['pause','load'])w.HTMLMediaElement.prototype[method]=()=>{};
w.HTMLMediaElement.prototype.play=async()=>{};
w.HTMLElement.prototype.setPointerCapture=()=>{};
run(fs.readFileSync('app/idle-video.js','utf8'));
for(const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g))run(m[1]);
for(const file of ['draw-engine.js','scroll-audio.js','result-video.js','figure.js'])run(fs.readFileSync('app/'+file,'utf8'));

(async()=>{
 try{
  assert.equal(run('APP_VER'),'swc-apac-v1');
  assert.equal(run('cfg.eventName'),'SWC2026 APAC Cup Lucky Draw');
  assert.equal(run('logArr.length'),0);
  assert.equal(run('JSON.stringify(stock)'),'{"ip1":[0,0]}');
  assert.equal(run('figureAvailable().ok'),false);
  assert.equal(run('figureProbabilityEnabled()'),false);
  assert.equal(run('JSON.stringify(cooldowns)'),'{}');
  assert.deepEqual(opened,[prefix+'-media']);
  w.saveCfg();
  assert.ok(w.localStorage.getItem(prefix+'.config.v1'));
  for(const [key,value] of Object.entries(before))assert.equal(w.localStorage.getItem(key),value);
  console.log('PASS: fresh event has no stock/history; original Figure Draw data ignored and unchanged');

  // Build a .kuji v2 fixture containing three winning products and a participation item.
  const cfg=JSON.parse(run('JSON.stringify(defaultConfig())'));
  cfg.ips[0].prizes=[
   {name:'Prize A',grade:'A',kind:'figure',tier:'high',count:2},
   {name:'Prize B',grade:'B',kind:'figure',tier:'high',count:3},
   {name:'Prize C',grade:'C',kind:'figure',tier:'high',count:4},
   {name:'Participation',grade:'D',kind:'participation',tier:'normal',count:5}
  ];
  const manifest={app:'kuji',v:2,scope:'full',part:1,parts:1,ls:{cfg:JSON.stringify(cfg),stock:JSON.stringify({ip1:[2,3,4,5]}),log:'[]'},media:[]};
  const bytes=new TextEncoder().encode(JSON.stringify(manifest)),backup=new Uint8Array(8+bytes.length);
  backup.set(new TextEncoder().encode('KUJI'));new DataView(backup.buffer).setUint32(4,bytes.length,true);backup.set(bytes,8);
  let clears=0;w.idbClear=async()=>{clears++;};w.idbPut=async()=>{};
  await w.applyBackup(backup.buffer);
  assert.equal(clears,1);
  assert.equal(JSON.parse(w.localStorage.getItem(prefix+'.config.v1')).ips[0].prizes.length,4);
  assert.deepEqual(JSON.parse(w.localStorage.getItem(prefix+'.draw-state.v1')),{stock:{ip1:[2,3,4,5]},log:[]});
  for(const [key,value] of Object.entries(before))assert.equal(w.localStorage.getItem(key),value);
  let stock={ip1:[2,3,4,5]};const awards={};
  for(let i=0;i<14;i++){const hit=w.FigureDrawEngine.draw(cfg.ips,stock,null,()=>.5);stock=hit.stock;awards[hit.p.name]=(awards[hit.p.name]||0)+1;}
  assert.deepEqual(awards,{'Prize C':4,'Prize B':3,Participation:5,'Prize A':2});
  assert.equal(w.FigureDrawEngine.availability(cfg.ips,stock).ok,false);
  console.log('PASS: legacy .kuji format restores only into new namespace; multiple winning products retain exact inventory');

  const manifestPwa=JSON.parse(fs.readFileSync('app/manifest.webmanifest','utf8'));
  assert.equal(manifestPwa.id,'./'+prefix);assert.equal(manifestPwa.scope,'./');assert.equal(manifestPwa.start_url,'./index.html');
  const handlers={},deleted=[],cacheNames=['figure-draw-v32','kuji-v31',prefix+'-v0',prefix+'-v1'];
  let claimed=false;
  vm.runInNewContext(fs.readFileSync('app/sw.js','utf8'),{
   self:{addEventListener:(name,fn)=>handlers[name]=fn,clients:{claim:async()=>{claimed=true;}}},
   caches:{keys:async()=>cacheNames,delete:async name=>{deleted.push(name);return true;}}
  });
  let activation;handlers.activate({waitUntil:p=>{activation=p;}});await activation;
  assert.deepEqual(deleted,[prefix+'-v0']);assert.equal(claimed,true);
  // Historical review pages must never read the old app's media or config, either.
  for(const v of ['v8','v9','v11']){
   const review=fs.readFileSync('app/review/'+v+'/index.html','utf8');
   assert.ok(!review.includes("'figure-draw"));
   assert.ok(review.includes('swc2026-apac-review-'+v+'.'));
   assert.ok(review.includes("indexedDB.open('"+prefix+"-media'"));
  }
  console.log('PASS: distinct PWA identity; cache activation preserves original app; review snapshots isolated');
 } finally {dom.window.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
