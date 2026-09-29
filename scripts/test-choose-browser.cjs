// Real Chrome check of the OAP v8 CHOOSE YOUR SCROLL screen against docs/oap-spec/choose-v8.
const {chromium}=require('../.tools/node_modules/playwright-core');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const root=path.resolve('app');
const layout=require('../docs/oap-spec/choose-v8/layout.json');
const server=http.createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.readFile(file,(error,data)=>{
  if(error){res.writeHead(404).end();return;}
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.mp4':'video/mp4','.wav':'audio/wav','.jpg':'image/jpeg','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'};
  res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');
  // Range support like GitHub Pages / the service worker, so video seeks behave as deployed.
  res.setHeader('Accept-Ranges','bytes');
  const m=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range||'');
  if(m){const start=m[1]?Number(m[1]):data.length-Number(m[2]),end=m[1]&&m[2]?Math.min(Number(m[2]),data.length-1):data.length-1;
   res.writeHead(206,{'Content-Range':`bytes ${start}-${end}/${data.length}`,'Content-Length':end-start+1});res.end(data.subarray(start,end+1));return;}
  res.end(data);
 });
});
const state=page=>page.evaluate(()=>{
 const s=document.getElementById('choose-stage'),i=document.getElementById('choose-bg-intro'),l=document.getElementById('choose-bg-loop');
 return {screen:currentScreen,classes:[...s.classList].filter(c=>c!=='choose-stage').sort(),introTime:i.currentTime,introPaused:i.paused,loopTime:l.currentTime,loopPaused:l.paused,diag:{...chooseScreenDiagnostics}};
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1024,height:1366},deviceScaleFactor:2,serviceWorkers:'block'}) // iPad Pro 12.9 CSS size and DPR;
  // Immediate screen swaps: the transition has its own suite (test-transition-browser). In-memory only.
  await page.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{if(typeof cfg!=='undefined')cfg.screenTransitions=false;}));
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'load'});
  await page.evaluate(()=>{stock={ip1:[0,10]};cfg.muted=true;cfg.idleTimeoutSec=600;refreshIdleSoldout(); // pixel checks outlast the 30 s idle return
   // Record the intro position at the moment the entrance CSS starts.
   const s=document.getElementById('choose-stage'),i=document.getElementById('choose-bg-intro');
   window.__entrance=[];new MutationObserver(()=>{if(s.classList.contains('is-playing')&&!window.__entrance.at(-1)?.open)window.__entrance.push({t:i.currentTime,at:performance.now(),open:true});if(!s.classList.contains('is-playing')&&window.__entrance.at(-1)?.open)window.__entrance.at(-1).open=false;if(s.classList.contains('is-interactive'))window.__entrance.at(-1).interactiveAt??=performance.now();}).observe(s,{attributes:true,attributeFilter:['class']});
  });
  assert.equal(await page.locator('#scroll-grid .scroll-choice').count(),12);

  // 1) Entry: entrance starts on the intro's first frame; input opens after 1.435 s.
  await page.locator('#idle-banner').click();
  let s=await state(page);assert.equal(s.screen,'scr-scrolls');assert.ok(!s.classes.includes('is-interactive'));
  await page.waitForFunction(()=>document.getElementById('choose-stage').classList.contains('is-interactive'),null,{timeout:5000});
  const entry=(await page.evaluate(()=>window.__entrance))[0];
  // A late frame callback is fine if the CSS timeline is shifted back by the same amount.
  const lag1=await page.evaluate(()=>chooseScreenDiagnostics.lastLag);
  assert.ok(entry.t<0.4&&Math.abs(entry.t-lag1)<0.05,`entrance on the video clock (intro t=${entry.t}, compensated ${lag1})`);
  const gap=entry.interactiveAt-entry.at+lag1*1000;assert.ok(gap>1400&&gap<1700,`input opens ~1.435 s of video time after the intro starts (${gap.toFixed(0)} ms)`);
  s=await state(page);assert.equal(s.diag.synced,1);assert.equal(s.diag.fallback,0);
  console.log('PASS: entrance synced to intro first frame (intro t=%s s), input after %s ms',entry.t.toFixed(3),gap.toFixed(0));

  // 2) Layout: final element boxes equal the AE spec (percent of the stage).
  await page.waitForTimeout(200); // input opens at the last entrance end; let it settle before measuring
  const boxes=await page.evaluate(()=>{const st=document.getElementById('choose-stage').getBoundingClientRect();const rel=e=>{const r=e.getBoundingClientRect();return {left:(r.left-st.left)/st.width*100,top:(r.top-st.top)/st.height*100,width:r.width/st.width*100,height:r.height/st.height*100};};
   return {stage:{w:st.width,h:st.height},cards:[...document.querySelectorAll('#scroll-grid .scroll-choice')].map(rel),random:rel(document.getElementById('scroll-random')),select:rel(document.getElementById('scroll-next'))};});
  assert.ok(Math.abs(boxes.stage.w-1024)<0.5&&Math.abs(boxes.stage.h-1366)<0.5,'stage fills the iPad viewport');
  const expect=Object.fromEntries(layout.elements.map(e=>[e.id,e.percent]));
  const cmp=(got,want,id)=>{for(const k of ['left','top','width','height'])assert.ok(Math.abs(got[k]-want[k])<0.05,`${id}.${k} ${got[k].toFixed(3)} vs ${want[k]}`);};
  boxes.cards.forEach((b,i)=>cmp(b,expect['scroll-'+String(i+1).padStart(2,'0')],'scroll-'+(i+1)));
  cmp(boxes.random,expect.random,'random');cmp(boxes.select,expect.select,'select');
  console.log('PASS: 14 element boxes match layout.json within 0.05% of the stage');

  // 3) Intro -> loop swap happens once, loop plays.
  await page.waitForFunction(()=>document.getElementById('choose-stage').classList.contains('loop-front'),null,{timeout:5000});
  s=await state(page);assert.equal(s.diag.loopSwaps,1);assert.equal(s.loopPaused,false);assert.equal(s.introPaused,true);
  console.log('PASS: intro holds its last frame until the loop presents, then loop plays');

  // 4) Visual comparison with the AE frame at t=3 s (loop t=1 s), all entrances complete.
  // Wait for the seeked frame to be presented (headless keeps the old frame after a paused seek otherwise).
  // Button shines are an app overlay, not part of the AE frame: park them off the button first.
  await page.evaluate(()=>document.getAnimations().forEach(a=>{if(a.animationName==='btn-sweep'){a.pause();a.currentTime=0;}}));
  const presented=await page.evaluate(async()=>{const l=document.getElementById('choose-bg-loop');l.pause();l.currentTime=1;await new Promise(r=>l.addEventListener('seeked',r,{once:true}));const shown=new Promise(r=>l.requestVideoFrameCallback((now,meta)=>{l.pause();r(meta.mediaTime);}));l.play();const t=await Promise.race([shown,new Promise(r=>setTimeout(()=>r(null),3000))]);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return t;});
  assert.ok(presented!==null&&Math.abs(presented-1)<0.04,`presented loop frame at ${presented}`);
  const shot=path.resolve('.tools/choose-v8-t3.png');await page.locator('#choose-stage').screenshot({path:shot});
  const ae=path.resolve('resource/oap/ae-work/render/choose-v8/verify/full-t3.png');
  if(fs.existsSync(ae)){
   const ff=path.resolve('.tools/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe');
   // ffmpeg reports PSNR on stderr.
   // Per element at DPR 2 = master pixels (inset 4 px): the app elements are static after the entrance, so they must match
   // the AE frame; the video background can land one frame off after pause, so it is excluded.
   // Chrome rasterises half-pixel boxes (e.g. top 186.5 CSS px) one device pixel either way, so take the
   // best alignment within +-1 device px; CSS boxes themselves are checked exactly in step 2.
   const psnr=box=>{const w=Math.floor(box.width)-8,h=Math.floor(box.height)-8,x=Math.ceil(box.left)+4,y=Math.ceil(box.top)+4;let best=0;
    for(const dx of [-1,0,1])for(const dy of [-1,0,1]){
     const run=spawnSync(ff,['-hide_banner','-i',shot,'-i',ae,'-filter_complex',`[0:v]format=gbrp,crop=${w}:${h}:${x+dx}:${y+dy}[a];[1:v]format=gbrp,crop=${w}:${h}:${x}:${y}[b];[a][b]psnr`,'-f','null','-'],{encoding:'utf8'});
     best=Math.max(best,Number((/average:([0-9.]+)/.exec(run.stderr)||[0,0])[1]));}
    return best;};
   const scores=Object.fromEntries(layout.elements.map(e=>[e.id,psnr(e.master)]));
   for(const [id,v] of Object.entries(scores))assert.ok(v>30,`${id} vs AE PSNR ${v}`);
   console.log('PASS: every app element vs AE master frame (t=3 s) PSNR > 30 dB within +-1 device px; min %s dB',Math.min(...Object.values(scores)).toFixed(2));
  }else console.log('SKIP: AE reference frame not present locally');
  await page.evaluate(()=>{document.getElementById('choose-bg-loop').play();document.getAnimations().forEach(a=>{if(a.animationName==='btn-sweep')a.play();});});

  // 5) Selection behaviour and handoff to the open screen.
  assert.equal(await page.getAttribute('#scroll-next','aria-disabled'),'true');
  await page.locator('#scroll-next').click({force:true}); // no selection: stays, explains (aria-disabled does not block taps)
  assert.equal(await page.evaluate(()=>currentScreen),'scr-scrolls');
  await page.locator('#scroll-grid .scroll-choice').nth(2).click();
  assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('#scroll-grid .scroll-choice')].map(b=>b.getAttribute('aria-pressed')==='true').flatMap((p,i)=>p?[i]:[])),[2]);
  assert.equal(await page.getAttribute('#scroll-next','aria-disabled'),'false');
  await page.waitForTimeout(300); // let the .18 s dim transition finish
  const look=await page.evaluate(()=>{const cards=[...document.querySelectorAll('#scroll-grid .scroll-choice')];const cs=e=>getComputedStyle(e);
   return {stage:document.getElementById('choose-stage').classList.contains('has-selection'),glitter:cs(cards[2].querySelector('.card-glitter')).display,otherGlitter:cs(cards[3].querySelector('.card-glitter')).display,
    otherFilter:cs(cards[3].querySelector('.card-lift')).filter,selectedFilter:cs(cards[2].querySelector('.card-lift')).filter,
    twinkles:document.getAnimations().filter(a=>a.animationName==='card-twinkle').length,selectGlow:document.getAnimations().some(a=>a.animationName==='card-breathe'&&a.effect.target.classList.contains('btn-glow')),
    home:document.querySelector('#scr-scrolls .choose-back').textContent.trim(),homeFont:cs(document.querySelector('#scr-scrolls .choose-back')).fontFamily};});
  assert.equal(look.stage,true);assert.equal(look.glitter,'block');assert.equal(look.otherGlitter,'none');
  assert.match(look.otherFilter,/brightness\(0\.78\)/);assert.equal(look.selectedFilter,'none');assert.equal(look.twinkles,8,'only the selected card twinkles');assert.equal(look.selectGlow,true);
  assert.equal(look.home,'←HOME');assert.match(look.homeFont,/Unbounded/);
  assert.equal(await page.evaluate(()=>document.fonts.check('700 20px Unbounded')),true);
  await page.locator('#scroll-random').click();
  assert.equal(await page.evaluate(()=>document.querySelectorAll('#scroll-grid .scroll-choice[aria-pressed=true]').length),1);
  const stockBefore=await page.evaluate(()=>JSON.stringify(stock));
  await page.locator('#scroll-next').click();
  s=await state(page);assert.equal(s.screen,'scr-open');assert.deepEqual(s.classes.filter(c=>c!=='has-selection'),[]); // selection persists into the open screenassert.equal(s.introPaused,true);assert.equal(s.loopPaused,true);
  assert.equal(await page.evaluate(()=>JSON.stringify(stock)),stockBefore,'selecting does not draw');
  console.log('PASS: single selection with glitter/dimming/SELECT glow, random, HOME label, SELECT opens scroll without drawing; choose videos stop on leave');

  // 6) Re-entry replays the intro from its start; back button returns home.
  await page.evaluate(()=>backFromScroll());
  await page.waitForFunction(()=>document.getElementById('choose-stage').classList.contains('is-interactive'),null,{timeout:5000});
  const entries=await page.evaluate(()=>window.__entrance);assert.equal(entries.length,2);const lag2=await page.evaluate(()=>chooseScreenDiagnostics.lastLag);assert.ok(entries[1].t<0.4&&Math.abs(entries[1].t-lag2)<0.05,`re-entry on the video clock (intro t=${entries[1].t}, compensated ${lag2})`);
  s=await state(page);assert.equal(s.diag.synced,2);assert.ok(!s.classes.includes('loop-front'));
  await page.locator('#scr-scrolls .back').click();
  s=await state(page);assert.equal(s.screen,'scr-idle');assert.equal(s.introPaused,true);assert.equal(s.loopPaused,true);
  console.log('PASS: re-entry restarts intro at t=%s s; back returns home and pauses both videos',entries[1].t.toFixed(3));
  assert.deepEqual(errors,[]);
 } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
