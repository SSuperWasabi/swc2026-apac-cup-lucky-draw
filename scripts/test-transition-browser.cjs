// Real Chrome check of the AE screen transition (stacked-alpha video recombined in WebGL).
const {chromium}=require('../.tools/node_modules/playwright-core');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const root=path.resolve('app');
const server=http.createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.readFile(file,(error,data)=>{
  if(error){res.writeHead(404).end();return;}
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.mp4':'video/mp4','.wav':'audio/wav','.jpg':'image/jpeg','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.ttf':'font/ttf'};
  res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');
  res.setHeader('Accept-Ranges','bytes');
  const m=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range||'');
  if(m){const start=m[1]?Number(m[1]):data.length-Number(m[2]),end=m[1]&&m[2]?Math.min(Number(m[2]),data.length-1):data.length-1;
   res.writeHead(206,{'Content-Range':`bytes ${start}-${end}/${data.length}`,'Content-Length':end-start+1});res.end(data.subarray(start,end+1));return;}
  res.end(data);
 });
});
const ff=path.resolve('.tools/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe');
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1024,height:1366},serviceWorkers:'block'});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'load'});
  await page.evaluate(()=>{stock={ip1:[0,10]};cfg.muted=true;cfg.idleTimeoutSec=600;refreshIdleSoldout();
   // Timeline of the first transition: when the screen swaps and when the choose entrance starts.
   window.__tl=[];const t0=()=>window.__t0;
   new MutationObserver(()=>window.__tl.push(['screen',currentScreen,performance.now()-t0(),document.getElementById('transition-video').currentTime])).observe(document.getElementById('scr-scrolls'),{attributes:true,attributeFilter:['class']});
   new MutationObserver(()=>{const s=document.getElementById('choose-stage');if(s.classList.contains('is-playing'))window.__tl.push(['entrance',currentScreen,performance.now()-t0(),document.getElementById('transition-video').currentTime]);}).observe(document.getElementById('choose-stage'),{attributes:true,attributeFilter:['class']});});
  assert.equal(await page.evaluate(()=>screenTransition.available),true,'WebGL transition available in Chrome');

  // 1) Idle -> choose: input blocked, swap only once covered, entrance as the cover lifts, overlay gone after.
  await page.evaluate(()=>{window.__t0=performance.now();});
  await page.locator('#idle-banner').click();
  const during=await page.evaluate(()=>({busy:screenTransition.busy,screen:currentScreen,canvas:getComputedStyle(document.getElementById('transition-canvas')).display,pe:getComputedStyle(document.getElementById('transition-canvas')).pointerEvents}));
  assert.deepEqual(during,{busy:true,screen:'scr-idle',canvas:'block',pe:'auto'},'the idle screen stays until the cover');
  await page.waitForFunction(()=>!screenTransition.busy,null,{timeout:6000});
  const tl=await page.evaluate(()=>window.__tl);
  const swap=tl.find(e=>e[0]==='screen'&&e[1]==='scr-scrolls'),entrance=tl.find(e=>e[0]==='entrance');
  assert.ok(swap&&swap[3]>=11/30&&swap[3]<0.8,`screen swaps while covered (transition t=${swap&&swap[3]})`);
  assert.ok(entrance&&entrance[3]>=48/30-0.05,`choose entrance starts as the cover lifts (transition t=${entrance&&entrance[3]})`);
  assert.equal(await page.evaluate(()=>getComputedStyle(document.getElementById('transition-canvas')).display),'none');
  assert.ok(entrance[2]<48/30/1.8*1000+400,`entrance at ${entrance[2].toFixed(0)} ms wall time (1.8x)`);
  console.log('PASS: idle -> choose: swap at t=%s s (covered), entrance at t=%s s (lifting), overlay removed; input blocked meanwhile',swap[3].toFixed(3),entrance[3].toFixed(3));

  // 2) Choose -> open cuts straight in (no transition).
  await page.waitForFunction(()=>document.getElementById('choose-stage').classList.contains('is-interactive'),null,{timeout:5000});
  await page.locator('#scroll-grid .scroll-choice').first().click();
  await page.locator('#scroll-next').click();
  assert.deepEqual(await page.evaluate(()=>({busy:screenTransition.busy,screen:currentScreen})),{busy:false,screen:'scr-open'},'choose -> open has no transition');
  console.log('PASS: choose -> open navigates at once without the transition');

  // 3) BACK plays it at 1.8x; the WebGL output matches the source frame (orientation, colour, premultiplied alpha).
  const stockBefore=await page.evaluate(()=>JSON.stringify(stock));
  const rate=await page.evaluate(()=>new Promise(resolve=>{
   const v=document.getElementById('transition-video'),orig=v.play.bind(v);
   // Freeze the transition on frame 30 (fully covered) for a screenshot, then let it finish.
   window.__freeze=()=>{const r=v.playbackRate;v.pause();v.currentTime=30/30;v.addEventListener('seeked',()=>{screenTransition.draw();requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(r)));},{once:true});};
   v.play=()=>orig().then(()=>{v.requestVideoFrameCallback(()=>window.__freeze());});
   document.getElementById('open-back').click();
  }));
  assert.equal(rate,1.8,'transition plays at 1.8x');
  const shot=path.resolve('.tools/transition-frame30.png');await page.screenshot({path:shot});
  const ref=path.resolve('.tools/transition-frame30-ref.png');
  spawnSync(ff,['-hide_banner','-loglevel','error','-y','-i','app/assets/oap/transition/transition-stacked.mp4','-vf','select=eq(n\\,30),crop=768:1024:0:0,scale=1024:1366:flags=bicubic','-frames:v','1',ref]);
  const run=spawnSync(ff,['-hide_banner','-i',shot,'-i',ref,'-filter_complex','[0:v]format=gbrp[a];[1:v]format=gbrp[b];[a][b]psnr','-f','null','-'],{encoding:'utf8'});
  const psnr=Number((/average:([0-9.]+)/.exec(run.stderr)||[0,0])[1]);
  assert.ok(psnr>28,`WebGL frame 30 vs source colour half PSNR ${psnr}`);
  await page.evaluate(()=>{const v=document.getElementById('transition-video');delete v.play;v.play();});
  await page.waitForFunction(()=>!screenTransition.busy&&currentScreen==='scr-scrolls',null,{timeout:6000});
  console.log('PASS: BACK (open -> choose) plays the transition at 1.8x; WebGL-composited frame 30 matches the source frame (PSNR %s dB)',psnr.toFixed(2));

  // HOME (choose -> idle) also transitions; the draw state is untouched.
  await page.waitForFunction(()=>document.getElementById('choose-stage').classList.contains('is-interactive'),null,{timeout:5000});
  await page.locator('#scr-scrolls .choose-back').click();
  assert.equal(await page.evaluate(()=>screenTransition.busy),true);
  await page.waitForFunction(()=>!screenTransition.busy&&currentScreen==='scr-idle',null,{timeout:6000});
  assert.equal(await page.evaluate(()=>JSON.stringify(stock)),stockBefore);
  console.log('PASS: HOME (choose -> idle) plays the transition; no draw');

  // 4) Admin switch off: immediate navigation. A broken video still completes the move (watchdog).
  await page.evaluate(()=>{cfg.screenTransitions=false;});
  await page.locator('#idle-banner').click();
  assert.deepEqual(await page.evaluate(()=>({busy:screenTransition.busy,screen:currentScreen})),{busy:false,screen:'scr-scrolls'});
  await page.evaluate(()=>{cfg.screenTransitions=true;const v=document.getElementById('transition-video');v.play=()=>Promise.reject(new Error('blocked'));});
  await page.locator('#scr-scrolls .choose-back').click();
  await page.waitForFunction(()=>!screenTransition.busy&&currentScreen==='scr-idle',null,{timeout:6000});
  console.log('PASS: switch off navigates at once; a refused video still completes the navigation');
  assert.deepEqual(errors,[]);
 } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
