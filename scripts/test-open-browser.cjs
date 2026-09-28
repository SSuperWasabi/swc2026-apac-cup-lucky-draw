// Real Chrome check of the OAP v3 OPEN YOUR SCROLL screen against docs/oap-spec/open-v3.
const {chromium}=require('../.tools/node_modules/playwright-core');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const root=path.resolve('app');
const layout=require('../docs/oap-spec/open-v3/layout.json');
const server=http.createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.readFile(file,(error,data)=>{
  if(error){res.writeHead(404).end();return;}
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.mp4':'video/mp4','.wav':'audio/wav','.jpg':'image/jpeg','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.ttf':'font/ttf'};
  res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');
  // Range support like GitHub Pages / the service worker, so video seeks behave as deployed.
  res.setHeader('Accept-Ranges','bytes');
  const m=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range||'');
  if(m){const start=m[1]?Number(m[1]):data.length-Number(m[2]),end=m[1]&&m[2]?Math.min(Number(m[2]),data.length-1):data.length-1;
   res.writeHead(206,{'Content-Range':`bytes ${start}-${end}/${data.length}`,'Content-Length':end-start+1});res.end(data.subarray(start,end+1));return;}
  res.end(data);
 });
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1024,height:1366},deviceScaleFactor:2,serviceWorkers:'block'}); // iPad Pro 12.9
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'load'});
  await page.evaluate(()=>{stock={ip1:[0,10]};cfg.muted=true;cfg.idleTimeoutSec=600;refreshIdleSoldout();});
  await page.locator('#idle-banner').click();
  await page.waitForFunction(()=>document.getElementById('choose-stage').classList.contains('is-interactive'),null,{timeout:5000});
  await page.locator('#scroll-grid .scroll-choice').nth(4).click();await page.locator('#scroll-next').click();
  assert.equal(await page.evaluate(()=>currentScreen),'scr-open');

  // 1) Frame loop plays only on this screen; boxes sit at the AE master coordinates.
  await page.waitForFunction(()=>!document.getElementById('open-frame-video').paused,null,{timeout:5000});
  const boxes=await page.evaluate(()=>{const st=document.getElementById('open-stage').getBoundingClientRect();const rel=s=>{const r=document.querySelector(s).getBoundingClientRect();return {left:(r.left-st.left)*2,top:(r.top-st.top)*2,width:r.width*2,height:r.height*2};};
   return {stage:[st.width,st.height],slot:rel('#scroll-drag'),drag:rel('#scroll-drag .drag-hint'),auto:rel('#scroll-open-btn')};});
  assert.deepEqual(boxes.stage,[1024,1366]);
  for(const [id,key] of [['slot','videoSlot'],['drag','dragGuide'],['auto','autoOpenButton']])
   for(const k of ['left','top','width','height'])assert.ok(Math.abs(boxes[id][k]-layout[key][k])<0.6,`${id}.${k} ${boxes[id][k]} vs ${layout[key][k]}`);
  console.log('PASS: frame loop playing; slot, drag guide and OPEN button at AE master coordinates (+-0.6 px)');

  // 2) Frame + scroll clip vs the AE IDLE_V3 frame at t=1 s (app overlays excluded).
  await page.evaluate(()=>document.getAnimations().forEach(a=>{if(a.animationName==='btn-sweep'||a.animationName==='drag-chevron-flow'){a.pause();a.currentTime=0;}}));
  // Seek, then play at the slowest rate so the pause lands on the seeked frame.
  const presented=await page.evaluate(async()=>{
   const show=v=>new Promise(r=>{v.pause();v.currentTime=1;v.addEventListener('seeked',()=>{v.playbackRate=0.0625;v.requestVideoFrameCallback((n,m)=>{v.pause();v.playbackRate=1;r(m.mediaTime);});v.play();},{once:true});});
   const t=await Promise.all([show(document.getElementById('open-frame-video')),show(document.getElementById('scroll-idle-video'))]);
   await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return t;});
  assert.ok(presented.every(t=>Math.abs(t-1)<0.04),`presented ${presented}`);
  const shot=path.resolve('.tools/open-v3-t1.png');await page.locator('#open-stage').screenshot({path:shot});
  const ae=path.resolve('resource/oap/ae-work/render/open-v3/verify/idle-t1.png');
  if(fs.existsSync(ae)){
   const ff=path.resolve('.tools/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe');
   const psnr=([w,h,x,y])=>{let best=0;for(const dx of [-1,0,1])for(const dy of [-1,0,1]){
    const run=spawnSync(ff,['-hide_banner','-i',shot,'-i',ae,'-filter_complex',`[0:v]format=gbrp,crop=${w}:${h}:${x+dx}:${y+dy}[a];[1:v]format=gbrp,crop=${w}:${h}:${x}:${y}[b];[a][b]psnr`,'-f','null','-'],{encoding:'utf8'});
    best=Math.max(best,Number((/average:([0-9.]+)/.exec(run.stderr)||[0,0])[1]));}return best;};
   // Header right of the BACK pill, and the scroll slot above the drag guide.
   const scores={header:psnr([1640,540,400,20]),slot:psnr([1760,1570,144,599])};
   for(const [k,v] of Object.entries(scores))assert.ok(v>30,`${k} vs AE PSNR ${v}`);
   console.log('PASS: frame + scroll clip vs AE IDLE_V3 (t=1 s) header %s dB, slot %s dB',scores.header.toFixed(2),scores.slot.toFixed(2));
  }else console.log('SKIP: AE reference frame not present locally');

  // 3) Playback failure explains in the centred hint (the button stays AE art), then leaving pauses the frame.
  await page.evaluate(()=>{drawing=true;scrollPlaybackError();});
  const failed=await page.evaluate(()=>({hint:document.getElementById('open-hint').classList.contains('is-visible'),text:document.getElementById('open-hint').textContent,img:!!document.querySelector('#scroll-open-btn img'),label:document.getElementById('scroll-open-btn').getAttribute('aria-label')}));
  assert.equal(failed.hint,true);assert.match(failed.text,/RETRY/);assert.equal(failed.img,true);assert.equal(failed.label,'Replay the scroll video');
  await page.evaluate(()=>{drawing=false;});
  await page.locator('#open-back').click();
  const back=await page.evaluate(()=>({screen:currentScreen,frame:document.getElementById('open-frame-video').paused,hint:document.getElementById('open-hint').classList.contains('is-visible'),label:document.getElementById('open-back').textContent.trim()}));
  assert.deepEqual(back,{screen:'scr-scrolls',frame:true,hint:false,label:'←BACK'});
  console.log('PASS: retry hint keeps the AE button; BACK returns to selection and pauses the frame loop');
  assert.deepEqual(errors,[]);
 } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
