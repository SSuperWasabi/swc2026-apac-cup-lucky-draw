// Real Chrome check of the AE screen transition: two natively played videos (matte x multiply, colour + add)
// must equal the original TRANS_ASIA alpha frames composited over the page, and drive the screen swap timing.
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
const SRC=path.resolve('resource/oap/ae-work/(0709) swc2026_oap_APAC_Final/(Footage)/@TRANS_ASIA');
const tmp=path.resolve('.tools');
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1024,height:1366},deviceScaleFactor:1,serviceWorkers:'block'});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'load'});
  await page.evaluate(()=>{stock={ip1:[0,10]};cfg.muted=true;cfg.idleTimeoutSec=600;refreshIdleSoldout();
   window.__tl=[];const t0=()=>window.__t0,clock=()=>document.getElementById('transition-colour').currentTime;
   new MutationObserver(()=>window.__tl.push(['screen',currentScreen,performance.now()-t0(),clock()])).observe(document.getElementById('scr-scrolls'),{attributes:true,attributeFilter:['class']});
   new MutationObserver(()=>{const s=document.getElementById('choose-stage');if(s.classList.contains('is-playing'))window.__tl.push(['entrance',currentScreen,performance.now()-t0(),clock()]);}).observe(document.getElementById('choose-stage'),{attributes:true,attributeFilter:['class']});});
  await page.waitForFunction(()=>screenTransition.warmed&&['transition-matte','transition-colour'].every(id=>document.getElementById(id).currentSrc.startsWith('blob:')),null,{timeout:8000});
  const clips=await page.evaluate(()=>['transition-matte','transition-colour'].map(id=>{const v=document.getElementById(id);return {frames:Math.round(v.duration*54),blend:getComputedStyle(v).mixBlendMode};}));
  assert.deepEqual(clips.map(c=>c.frames),[61,61],'all 61 authored frames at 54 fps in both clips (1.8x baked in)');
  assert.equal(clips[0].blend,'multiply');assert.match(clips[1].blend,/plus-lighter|screen/);
  console.log('PASS: matte (%s) + colour (%s) clips held in memory, 61 frames each at 54 fps',clips[0].blend,clips[1].blend);

  // 1) Idle -> choose: input blocked, swap only once covered, entrance as the cover lifts, layers hidden after.
  // Also record which frame each clip presents, to check they play frame-locked.
  await page.evaluate(()=>{window.__rec=true;window.__f={m:[],c:[]};for(const [k,id] of [['m','transition-matte'],['c','transition-colour']]){const v=document.getElementById(id);const cb=(now,meta)=>{if(screenTransition.busy)window.__f[k].push([meta.expectedDisplayTime,Math.round(meta.mediaTime*54)]);if(window.__rec)v.requestVideoFrameCallback(cb);};v.requestVideoFrameCallback(cb);}});
  await page.evaluate(()=>{window.__t0=performance.now();});
  await page.locator('#idle-banner').click();
  const during=await page.evaluate(()=>({busy:screenTransition.busy,screen:currentScreen,shown:getComputedStyle(document.getElementById('transition-colour')).visibility,shield:getComputedStyle(document.getElementById('transition-shield')).display}));
  assert.deepEqual(during,{busy:true,screen:'scr-idle',shown:'visible',shield:'block'},'the idle screen stays until the cover');
  await page.waitForFunction(()=>!screenTransition.busy,null,{timeout:6000});
  const tl=await page.evaluate(()=>window.__tl);
  const swap=tl.find(e=>e[0]==='screen'&&e[1]==='scr-scrolls'),entrance=tl.find(e=>e[0]==='entrance');
  assert.ok(swap&&swap[3]>=11/54&&swap[3]<0.5,`screen swaps while covered (transition t=${swap&&swap[3]})`);
  assert.ok(entrance&&entrance[3]>=48/54-0.05,`choose entrance starts as the cover lifts (transition t=${entrance&&entrance[3]})`);
  assert.ok(entrance[2]<48/54*1000+400,`entrance at ${entrance[2].toFixed(0)} ms wall time`);
  assert.deepEqual(await page.evaluate(()=>({shown:getComputedStyle(document.getElementById('transition-colour')).visibility,shield:getComputedStyle(document.getElementById('transition-shield')).display,t:document.getElementById('transition-colour').currentTime})),{shown:'hidden',shield:'none',t:0});
  console.log('PASS: idle -> choose: swap at t=%s s (covered), entrance at t=%s s (lifting), layers hidden and rewound after',swap[3].toFixed(3),entrance[3].toFixed(3));
  const sync=await page.evaluate(()=>{window.__rec=false;const {m,c}=window.__f;let worst=0;for(const [t,f] of c){let g=null;for(const [tm,x] of m){if(tm<=t+1)g=x;else break;}if(g!==null)worst=Math.max(worst,Math.abs(g-f));}return {m:m.length,c:c.length,worst};});
  // Headless presentation counts vary with page load; the main-thread independence is checked in step 4.
  assert.ok(sync.m>=30&&sync.c>=30,'presented frames matte '+sync.m+' colour '+sync.c);assert.ok(sync.worst<=1,'clips within one frame ('+sync.worst+')');
  console.log('PASS: real playback presents %s/%s of 61 frames (matte/colour), at most %s frame apart',sync.m,sync.c,sync.worst);

  // 2) The blended result equals the original alpha frame composited over the page (partial and full cover).
  await page.waitForFunction(()=>document.getElementById('choose-stage').classList.contains('is-interactive'),null,{timeout:5000});
  // Freeze the page under the transition (videos and CSS animations) so the only change is the blended layers.
  await page.evaluate(()=>document.querySelectorAll('video').forEach(v=>{if(!v.classList.contains('screen-transition-layer'))v.pause();}));
  await page.addStyleTag({content:'*:not(.screen-transition-layer),*::before,*::after{animation-play-state:paused!important;transition:none!important}'});
  await page.waitForTimeout(300);
  const base=path.join(tmp,'transition-base.png');
  // The exact encoded frames of both clips, stacked with the app's own layer classes (blend modes, z-order).
  const frameOf=(clip,n)=>{const out=path.join(tmp,`transition-${clip}-${n}.png`);spawnSync(ff,['-hide_banner','-loglevel','error','-y','-i',`app/assets/oap/transition/transition-${clip}.mp4`,'-vf',`select=eq(n\\,${n})`,'-frames:v','1',out]);return 'data:image/png;base64,'+fs.readFileSync(out).toString('base64');};
  for(const mode of ['','screen']){
   for(const n of [8,30,52]){
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await page.screenshot({path:base});
    await page.evaluate(([m,c,mode])=>new Promise(resolve=>{
     const imgs=[['is-matte',m],['is-colour',c]].map(([cls,src])=>{const i=document.createElement('img');i.className='screen-transition-layer is-active test-still '+cls;i.src=src;document.body.appendChild(i);return i;});
     imgs[1].style.mixBlendMode=mode||'';Promise.all(imgs.map(i=>i.decode())).then(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    }),[frameOf('matte',n),frameOf('color',n),mode]);
    const shot=path.join(tmp,`transition-${n}.png`),ref=path.join(tmp,`transition-${n}-ref.png`);await page.screenshot({path:shot});
    await page.evaluate(()=>document.querySelectorAll('.test-still').forEach(i=>i.remove()));
    const src=path.join(SRC,`TRANS_ASIA_${String(n+6).padStart(5,'0')}.png`);
    spawnSync(ff,['-hide_banner','-loglevel','error','-y','-i',base,'-i',src,'-filter_complex','[1:v]format=rgba,scale=-2:1024:flags=lanczos,crop=768:1024,scale=1024:1366:flags=bicubic[t];[0:v][t]overlay=0:0:format=auto,format=rgb24','-frames:v','1',ref]);
    const run=spawnSync(ff,['-hide_banner','-i',shot,'-i',ref,'-filter_complex','[0:v]format=gbrp[a];[1:v]format=gbrp[b];[a][b]psnr','-f','null','-'],{encoding:'utf8'});
    const psnr=Number((/average:([0-9.]+)/.exec(run.stderr)||[0,0])[1]);
    assert.ok(psnr>30,`frame ${n} (${mode||'default'}) blended vs true alpha composite PSNR ${psnr}`);
    console.log('PASS: frame %s, colour blend %s: the app layers blend the encoded clips into the true alpha composite (PSNR %s dB)',n,mode||clips[1].blend,psnr.toFixed(2));
   }
  }
  await page.evaluate(()=>{document.getElementById('transition-colour').style.mixBlendMode='';screenTransition.show(false);screenTransition.rewind();});

  // 3) Only main -> selection and result -> main transition (team feedback, v21): open, BACK and HOME cut straight in.
  await page.locator('#scroll-grid .scroll-choice').first().click();
  await page.locator('#scroll-next').click();
  assert.deepEqual(await page.evaluate(()=>({busy:screenTransition.busy,screen:currentScreen})),{busy:false,screen:'scr-open'},'choose -> open has no transition');
  const stockBefore=await page.evaluate(()=>JSON.stringify(stock));
  await page.locator('#open-back').click();
  assert.deepEqual(await page.evaluate(()=>({busy:screenTransition.busy,screen:currentScreen})),{busy:false,screen:'scr-scrolls'},'BACK has no transition');
  await page.waitForFunction(()=>document.getElementById('choose-stage').classList.contains('is-interactive'),null,{timeout:5000});
  await page.locator('#scr-scrolls .choose-back').click();
  assert.equal(await page.evaluate(()=>screenTransition.busy),true,'HOME은 전환 영상이 재생된다(v22)');
  await page.waitForFunction(()=>!screenTransition.busy&&currentScreen==='scr-idle',null,{timeout:6000});
  assert.equal(await page.evaluate(()=>JSON.stringify(stock)),stockBefore);
  // A result returns to the main screen through the transition.
  await page.evaluate(()=>{cfg.resultReturnSec=3;});
  await page.locator('#idle-banner').click();
  await page.waitForFunction(()=>!screenTransition.busy&&document.getElementById('choose-stage').classList.contains('is-interactive'),null,{timeout:8000});
  await page.locator('#scroll-grid .scroll-choice').first().click();await page.locator('#scroll-next').click();
  await page.locator('#scroll-drag').focus();await page.keyboard.press('Enter');
  await page.waitForFunction(()=>currentScreen==='scr-result',null,{timeout:20000});
  await page.waitForFunction(()=>screenTransition.busy&&currentScreen==='scr-result',null,{timeout:8000});
  await page.waitForFunction(()=>!screenTransition.busy&&currentScreen==='scr-idle',null,{timeout:6000});
  console.log('PASS: 오픈·BACK은 바로 이동, HOME과 결과 -> 메인은 전환 영상 재생');

  // 4) A busy main thread does not stop the pictures: block it for 300 ms mid-transition, the clips keep advancing.
  await page.locator('#idle-banner').click();
  const moved=await page.evaluate(()=>new Promise(resolve=>{setTimeout(()=>{const v=document.getElementById('transition-colour'),a=v.currentTime,end=performance.now()+300;while(performance.now()<end){}setTimeout(()=>resolve([a,v.currentTime]),0);},150);}));
  assert.ok(moved[1]-moved[0]>0.2,`clip advanced ${((moved[1]-moved[0])*1000).toFixed(0)} ms of media during a 300 ms main-thread block`);
  await page.waitForFunction(()=>!screenTransition.busy&&currentScreen==='scr-scrolls',null,{timeout:6000});
  console.log('PASS: the transition keeps playing through a 300 ms main-thread block (media advanced %s s)',(moved[1]-moved[0]).toFixed(3));

  // 5) Admin switch off: immediate navigation. A refused video still completes the move.
  await page.waitForFunction(()=>document.getElementById('choose-stage').classList.contains('is-interactive'),null,{timeout:5000});
  await page.locator('#scr-scrolls .choose-back').click();await page.waitForFunction(()=>currentScreen==='scr-idle',null,{timeout:3000});
  await page.evaluate(()=>{cfg.screenTransitions=false;});
  await page.locator('#idle-banner').click();
  assert.deepEqual(await page.evaluate(()=>({busy:screenTransition.busy,screen:currentScreen})),{busy:false,screen:'scr-scrolls'});
  await page.locator('#scr-scrolls .choose-back').click();await page.waitForFunction(()=>currentScreen==='scr-idle',null,{timeout:3000});
  await page.evaluate(()=>{cfg.screenTransitions=true;document.getElementById('transition-colour').play=()=>Promise.reject(new Error('blocked'));});
  await page.locator('#idle-banner').click();
  await page.waitForFunction(()=>!screenTransition.busy&&currentScreen==='scr-scrolls',null,{timeout:6000});
  console.log('PASS: switch off navigates at once; a refused video still completes the navigation');
  assert.deepEqual(errors,[]);
 } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
