// Uses a fresh browser context only; never the operator's Chrome/iPad profile.
const {chromium}=require('../.tools/node_modules/playwright-core');
const assert=require('node:assert/strict');
const target=process.argv[2];
if(!target||new URL(target).protocol!=='https:')throw Error('Pass the deployed HTTPS app URL');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1024,height:1366}});
  await context.addInitScript(()=>{
   localStorage.setItem('figure-draw.config.v1',JSON.stringify({eventName:'OLD EVENT SENTINEL'}));
   localStorage.setItem('figure-draw.draw-state.v1',JSON.stringify({stock:{legacy:[99]},log:[{sentinel:true}]}));
  });
  const page=await context.newPage();
  await page.goto(target,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>navigator.serviceWorker.controller&&typeof APP_VER!=='undefined'&&typeof idb!=='undefined'&&idb,{timeout:90000});
  const state=await page.evaluate(async()=>({
   version:APP_VER,eventName:cfg.eventName,stock,logs:logArr.length,db:idb.name,
   manifest:await(await fetch('manifest.webmanifest')).json(),caches:await caches.keys(),
   oldConfig:JSON.parse(localStorage.getItem('figure-draw.config.v1')),
   oldState:JSON.parse(localStorage.getItem('figure-draw.draw-state.v1')),
   controller:navigator.serviceWorker.controller.scriptURL
  }));
  assert.equal(state.version,'swc-apac-v1');assert.equal(state.db,'swc2026-apac-lucky-draw-media');
  assert.equal(state.eventName,'SWC2026 APAC Cup Lucky Draw');assert.deepEqual(state.stock,{ip1:[0,0]});assert.equal(state.logs,0);
  assert.equal(state.manifest.id,'./swc2026-apac-lucky-draw');
  assert.equal(state.oldConfig.eventName,'OLD EVENT SENTINEL');assert.deepEqual(state.oldState.stock,{legacy:[99]});
  assert.ok(state.caches.includes('swc2026-apac-lucky-draw-v1'));
  assert.equal(state.controller,new URL('sw.js',target).href);
  await context.setOffline(true);
  await page.reload({waitUntil:'load'});
  await page.waitForFunction(()=>typeof idb!=='undefined'&&idb&&document.getElementById('idle-version').textContent==='swc-apac-v1');
  const range=await page.evaluate(async()=>{
   const response=await fetch('assets/figure/sacred-idle.mp4',{headers:{Range:'bytes=0-1023'}});
   return {status:response.status,bytes:(await response.arrayBuffer()).byteLength,range:response.headers.get('Content-Range')};
  });
  assert.equal(range.status,206);assert.equal(range.bytes,1024);
  await page.screenshot({path:'.tools/swc-apac-v1-offline.png'});
  console.log('PASS: deployed PWA identity/controller/cache, fresh event, original storage sentinels unchanged, offline reload and MP4 range',JSON.stringify(range));
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
