// Isolated Chrome profile + local server: never opens the operator's stored data.
const {chromium}=require('../.tools/node_modules/playwright-core');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve('app'),clip=path.resolve(process.argv[2]||'app/assets/figure/sacred-idle.mp4');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.mp4':'video/mp4','.wav':'audio/wav','.jpg':'image/jpeg','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'};
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file=pathname==='/test-result.mp4'?clip:path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(file!==clip&&!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  fs.stat(file,(err,stat)=>{
    if(err||!stat.isFile()){res.writeHead(404).end();return;}
    const range=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||'');
    const start=range?Number(range[1]):0,end=range&&range[2]?Math.min(Number(range[2]),stat.size-1):stat.size-1;
    if(start>end){res.writeHead(416).end();return;}
    res.writeHead(range?206:200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Accept-Ranges':'bytes','Content-Length':end-start+1,...(range?{'Content-Range':`bytes ${start}-${end}/${stat.size}`}:{})});
    fs.createReadStream(file,{start,end}).pipe(res);
  });
});

(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 let page;
 try{
  page=await browser.newPage({viewport:{width:1024,height:1366},serviceWorkers:'block'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof resultLoop!=='undefined'&&!!idb);
  await page.evaluate(async()=>{
   const buf=await(await fetch('/test-result.mp4')).arrayBuffer();
   await idbPut('probe-loss',{buf,type:'video/mp4'});await idbPut('probe-popup',{buf,type:'video/mp4'});
   const idle=await(await fetch('assets/figure/sacred-idle.mp4')).arrayBuffer();
   for(const id of ['one','two'])await idbPut('idlevid_'+id,{buf:idle,type:'video/mp4'});
   cfg.idleVideos=[{id:'one'},{id:'two'}];cfg.ips[0].prizes[1].videoKey='probe-loss';
   cfg.figureProbabilityEnabled=true;cfg.figureWinPercent=0;cfg.muted=true;stock={ip1:[2,40]};
   window.lossReads=0;const read=idbGet;idbGet=async key=>{if(key==='probe-loss')lossReads++;return read(key);};
   await bootIdle();scheduleResultLoop();
  });
  const ready=()=>page.waitForFunction(()=>resultLoop.entry?.ready&&resultLoop.video.paused&&!resultLoop.video.seeking&&idleDeck.next?.state==='ready',null,{timeout:30000});
  await ready();
  assert.equal(await page.evaluate(()=>logArr.length),0,'preparation must not draw');
  const originalSource=await page.evaluate(()=>resultLoop.video.currentSrc);
  await page.evaluate(()=>{window.originalResultVideo=resultLoop.video;window.probeCounts={load:0,seek:0,waiting:0};const v=resultLoop.video,load=v.load.bind(v);v.load=()=>{probeCounts.load++;return load();};v.addEventListener('seeking',()=>{if(currentScreen==='scr-result')probeCounts.seek++;});v.addEventListener('waiting',()=>{if(currentScreen==='scr-result')probeCounts.waiting++;});});
  const times=[];
  for(let i=0;i<10;i++){
   await ready();
   await page.evaluate(()=>{go('scr-open');selectedScroll=0;commitFigureDraw();showResult();startResultMedia();});
   await page.waitForFunction(()=>{const enter=resultVideoDiagnostics.findLast(e=>e.event==='enter');return resultVideoDiagnostics.some(e=>e.event==='entry-frame'&&e.at>=enter.at);});
   const sample=await page.evaluate(()=>({
    enter:resultVideoDiagnostics.findLast(e=>e.event==='enter'),frame:resultVideoDiagnostics.findLast(e=>e.event==='entry-frame'),
    same:resultLoop.video===originalResultVideo,source:resultLoop.video.currentSrc,counts:{...probeCounts},
    muted:resultLoop.video.muted,logs:logArr.length,stock:stock.ip1[1],remaining:resultDeadline-Date.now(),
    resultVisible:document.getElementById('scr-result').classList.contains('active')&&!document.getElementById('scr-result').inert
   }));
   assert.equal(sample.enter.warm,true);assert.equal(sample.same,true);assert.equal(sample.source,originalSource);
   assert.deepEqual(sample.counts,{load:0,seek:0,waiting:0});assert.equal(sample.muted,true);
   assert.equal(sample.logs,i+1);assert.equal(sample.stock,39-i);assert.ok(sample.remaining>3500&&sample.remaining<=5000);assert.equal(sample.resultVisible,true);
   assert.ok(sample.frame.mediaTime<.12);times.push(sample.frame.ms);
   if(i===0)await page.screenshot({path:'.tools/result-loop-v32.png'});
   await page.evaluate(()=>resetToIdle());
   await page.waitForFunction(()=>currentScreen==='scr-idle'&&!idleDeck.active.video.paused);
   assert.equal(await page.evaluate(()=>idleVideoDiagnostics.findLast(e=>e.event==='enter').warm),true,'main predecode must not regress');
  }
  assert.equal(await page.evaluate(()=>lossReads),1,'one IDB read across all results');
  console.log('PASS: 10 results, one IDB read/node/source, no result-time load/seek/waiting, start frame, atomic draw, main warm returns; frame ms:',times);
  await ready();
  await page.evaluate(()=>{cfg.ips[0].prizes[1].popupVideoKey='probe-popup';go('scr-open');commitFigureDraw();showResult();startResultMedia();});
  await page.locator('#rc-img').click();
  await page.waitForSelector('.figure-media-popup');
  await page.waitForTimeout(5200);
  assert.equal(await page.evaluate(()=>currentScreen), 'scr-result','popup must suspend auto-return');
  await page.locator('.figure-media-popup button').click();
  assert.ok(await page.evaluate(()=>resultDeadline-Date.now()>4500),'closing popup retains the existing five-second rule');
  await page.waitForFunction(()=>currentScreen==='scr-idle',null,{timeout:7000});
  console.log('PASS: original click target, popup pause/close/five-second automatic return');
  await ready();
  await page.evaluate(()=>{resultLoop.suspend();idleDeck.suspend();});
  assert.equal(await page.evaluate(()=>resultLoop.video.paused&&idleDeck.videos.every(v=>v.paused)),true);
  await page.evaluate(()=>{idleDeck.resume();resultLoop.resume();scheduleResultLoop();});
  await ready();
  // Win/no-video and multiple-participation-video fallback keep their original renderer.
  await page.evaluate(()=>{const p=cfg.ips[0].prizes[0];lastResult={ip:cfg.ips[0],prize:p,media:p,high:true,wonName:p.name,serial:20};showResult();startResultMedia();});
  assert.equal(await page.evaluate(()=>resultLoop.visible),false);
  assert.equal(await page.locator('#rc-img [aria-label="경품 이미지 미등록"]').count(),1);
  assert.equal(await page.locator('#rc-img img').count(),0,'missing prize image must not imply a Zeratu prize');
  await page.evaluate(()=>{const p=cfg.ips[0].prizes[0];imgCache['probe-win']='assets/figure/scroll.webp';lastResult={ip:cfg.ips[0],prize:{...p,imageKey:'probe-win'},media:p,high:true,wonName:'Prize A',serial:20};showResult();startResultMedia();});
  assert.equal(await page.locator('#rc-img img').count(),1);
  assert.equal(await page.locator('#rc-img img').getAttribute('src'),'assets/figure/scroll.webp');
  await page.evaluate(()=>{resetToIdle();cfg.ips[0].prizes.push({name:'second',kind:'participation',videoKey:'probe-popup'});scheduleResultLoop();});
  assert.equal(await page.evaluate(()=>participationVideoKey()),null);
  assert.equal(await page.evaluate(()=>resultLoop.entry),null);
  await page.evaluate(async()=>{const ip=cfg.ips[0],p=ip.prizes[1];lastResult={ip,prize:p,media:p,high:false,wonName:p.name,serial:21};showResult();await startResultMedia();});
  await page.waitForFunction(()=>document.querySelector('#rc-img video')?.readyState>=2);
  assert.equal(await page.evaluate(()=>resultLoop.visible),false);
  console.log('PASS: background pause/resume, winning image, multiple-clip legacy fallback');
  // A removed/replaced clip must not return from an outstanding storage read.
  await page.evaluate(async()=>{
   resetToIdle();cfg.ips[0].prizes.pop();
   const read=idbGet;window.releaseResultRead=null;
   idbGet=async key=>{if(key==='delayed-loss'){await new Promise(r=>releaseResultRead=r);return read('probe-loss');}return read(key);};
   cfg.ips[0].prizes[1].videoKey='delayed-loss';resultLoop.prepare('delayed-loss');
   cfg.ips[0].prizes[1].videoKey=null;scheduleResultLoop();releaseResultRead();idbGet=read;
  });
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>resultLoop.entry),null);
  assert.equal(await page.evaluate(()=>resultLoop.video.hasAttribute('src')),false);
  assert.deepEqual(errors,[]);
  console.log('PASS: in-flight read cancellation on removal; no page errors; bytes:',fs.statSync(clip).size);
 }catch(error){
  if(page)console.log(await page.evaluate(()=>({result:window.resultVideoDiagnostics,screen:currentScreen,entry:resultLoop.entry&&{state:resultLoop.entry.state,ready:resultLoop.entry.ready,time:resultLoop.video.currentTime}})).catch(()=>null));
  throw error;
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);server.closeAllConnections();server.close();process.exitCode=1;});
