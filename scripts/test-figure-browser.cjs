const {chromium}=require('../.tools/node_modules/playwright-core');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve('app');
const server=http.createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.readFile(file,(error,data)=>{
  if(error){res.writeHead(404).end();return;}
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.mp4':'video/mp4','.wav':'audio/wav','.jpg':'image/jpeg','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'};
  res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');
  // Deliberately no Range support: exercise the original local-server fallback too.
  res.end(data);
 });
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1024,height:1366},serviceWorkers:'block'});
  // Immediate screen swaps: the transition has its own suite (test-transition-browser). In-memory only.
  await page.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{if(typeof cfg!=='undefined')cfg.screenTransitions=false;}));
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  let release;const mediaGate=new Promise(resolve=>{release=resolve;});
  await page.route('**/sacred-open.mp4',async route=>{await mediaGate;await route.continue();});
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>{stock={ip1:[0,10]};cfg.muted=true;refreshIdleSoldout();});
  await page.evaluate(()=>document.fonts.ready);
  await page.evaluate(async()=>{const buf=await(await fetch('assets/figure/sacred-idle.mp4')).arrayBuffer();await idbPut('idlevid_browser_test',{buf,type:'video/mp4'});cfg.idleVideos=[{id:'browser_test'}];await playIdleVideo();});
  await page.waitForFunction(()=>idleDeck.active?.state==='ready'&&idleDeck.next?.state==='ready',null,{timeout:10000});
  assert.equal(await page.locator('#idle-video-poster').count(),0);
  const idleVideo=await page.evaluate(()=>{const v=document.getElementById('idle-video'),b=document.getElementById('idle-video-blur');return {videos:document.querySelectorAll('#scr-idle video').length,backdropTag:b.tagName,playing:!v.paused};});
  assert.deepEqual(idleVideo,{videos:2,backdropTag:'DIV',playing:true});
  await page.screenshot({path:'.tools/lucky-idle.png'});
  await page.locator('#idle-banner').click();assert.equal(await page.evaluate(()=>document.getElementById('idle-video').paused),true);await page.locator('.scroll-choice').first().click();await page.locator('#scroll-next').click();
  const initialHandle=await page.evaluate(()=>{const track=document.querySelector('.drag-track').getBoundingClientRect(),handleNode=document.querySelector('.drag-handle'),handle=handleNode.getBoundingClientRect();return {trackLeft:track.left,handleLeft:handle.left,animations:handleNode.getAnimations().length};});
  assert.ok(Math.abs(initialHandle.handleLeft-initialHandle.trackLeft)<=3,'drag handle must start against the far-left track border');
  assert.equal(initialHandle.animations,0,'idle drag handle must remain stationary');
  await page.evaluate(()=>{const box=document.getElementById('scroll-drag');box.classList.add('scrubbing');setScrollProgress(0);});await page.screenshot({path:'.tools/lucky-open.png'});
  await page.evaluate(()=>document.getElementById('scroll-drag').classList.remove('scrubbing'));
  await page.waitForTimeout(700);
  await page.screenshot({path:'.tools/lucky-open-motion.png'});
  assert.ok(await page.evaluate(()=>Math.abs(document.querySelector('.drag-handle').getBoundingClientRect().left-document.querySelector('.drag-track').getBoundingClientRect().left)<=3),'idle drag handle must stay at the far-left edge');
  const arrow=await page.evaluate(()=>{
    const box=document.getElementById('scroll-drag'),chevrons=[...box.querySelectorAll('.drag-chevron')],handle=box.querySelector('.drag-handle'),hint=box.querySelector('.drag-hint');
    box.classList.add('scrubbing');
    const states=[0,.6,.2,0].map(progress=>{setScrollProgress(progress);return {active:chevrons.filter(node=>node.classList.contains('is-active')).length,left:handle.getBoundingClientRect().left};});
    const visible=getComputedStyle(hint).opacity,cueStroke=parseFloat(getComputedStyle(chevrons[0]).borderRightWidth);box.classList.remove('scrubbing');const cueAnimations=chevrons.map(node=>node.getAnimations().length);return {count:chevrons.length,states,visible,cueStroke,cueAnimations};
  });
  assert.equal(arrow.count,10);assert.deepEqual(arrow.states.map(state=>state.active),[0,6,2,0]);assert.ok(arrow.states[1].left>arrow.states[2].left&&arrow.states[2].left>arrow.states[0].left);assert.equal(arrow.states[0].left,arrow.states[3].left);assert.equal(arrow.visible,'0.75'); // v3 open frame: the SLIDE text is baked into the AE video
assert.equal(arrow.cueStroke,15); // v22 드래그 UI 확대: 쉐브론 선 12 -> 15px
assert.deepEqual(arrow.cueAnimations,new Array(10).fill(1));
  await page.locator('#scroll-drag').focus();await page.keyboard.press('Enter'); // automatic opening (keyboard path; the AUTO OPEN button was removed in v21)
  const cold=await page.evaluate(()=>({ready:scrollVideo().readyState,visible:getComputedStyle(document.getElementById('scroll-idle-video')).visibility,log:logArr.length}));
  assert.equal(cold.ready,0,'test must click while real video is still loading');
  assert.equal(cold.visible,'visible','keep idle image/video visible during preparation');assert.equal(cold.log,0);
  release();
  try{await page.waitForFunction(()=>currentScreen==='scr-result',null,{timeout:20000});}
  catch(error){console.log(await page.evaluate(()=>({screen:currentScreen,drawing,pending:scrollAutoPending,events:window.scrollMediaDiagnostics,ready:scrollVideo().readyState,time:scrollVideo().currentTime,error:scrollVideo().error?.message,src:scrollVideo().currentSrc})));throw error;}
  await page.screenshot({path:'.tools/lucky-result.png'});
  assert.equal(await page.evaluate(()=>logArr.length),1);
  assert.deepEqual(errors,[]);
  console.log('PASS: current + prepared next idle slots without a poster; automatic reveal completes once (Chrome, no Range server)');
  await page.unroute('**/sacred-open.mp4');
  await page.evaluate(()=>resetToIdle());
  await page.locator('#idle-banner').click();await page.locator('.scroll-choice').first().click();await page.locator('#scroll-next').click();
  const box=await page.locator('#scroll-drag').boundingBox();
  await page.evaluate(()=>{cfg.muted=false;touchSfxAt=-1e9;});
  await page.mouse.move(box.x+20,box.y+box.height/2);await page.mouse.down();
  assert.equal(await page.evaluate(()=>ScrollSound.fxActive('touch')),true,'소환서를 누르는 순간 터치음');
  await page.mouse.move(box.x+box.width*.5,box.y+box.height/2,{steps:8});
  try{await page.waitForFunction(()=>scrollVideo().currentTime>1&&!scrollVideo().seeking,null,{timeout:10000});}
  catch(error){console.log(await page.evaluate(()=>({scrubbing:scrollScrubbing,ready:scrollVideo().readyState,time:scrollVideo().currentTime,seeking:scrollVideo().seeking,target:scrollSeekTarget,progress:document.getElementById('scroll-drag').style.getPropertyValue('--progress'),events:scrollMediaDiagnostics.slice(-12)})));throw error;}
  await page.mouse.move(box.x+20,box.y+box.height/2,{steps:8});await page.mouse.up();
  assert.equal(await page.evaluate(()=>logArr.length),1);
  assert.equal(await page.evaluate(()=>ScrollSound.fxActive('touch')),false,'끝까지 열지 않고 떼면 터치음이 줄어듦');
  console.log('PASS: actual video seeks during drag; reversed/cancelled drag does not draw; 누르는 순간 터치음, 떼면 줄어듦');
  const measured=await page.evaluate(async()=>{
    const c=audioCtx();await c.resume();cfg.muted=false;cfg.bgmMode='single';cfg.bgmSingleSlot='idle';
    const samples=44100,bytes=new ArrayBuffer(44+samples*2),d=new DataView(bytes);
    const str=(at,s)=>{for(let i=0;i<s.length;i++)d.setUint8(at+i,s.charCodeAt(i));};
    str(0,'RIFF');d.setUint32(4,36+samples*2,true);str(8,'WAVE');str(12,'fmt ');d.setUint32(16,16,true);d.setUint16(20,1,true);d.setUint16(22,1,true);d.setUint32(24,44100,true);d.setUint32(28,88200,true);d.setUint16(32,2,true);d.setUint16(34,16,true);str(36,'data');d.setUint32(40,samples*2,true);
    for(let i=0;i<samples;i++)d.setInt16(44+i*2,Math.sin(i*2*Math.PI*440/44100)*16000,true);
    const url=URL.createObjectURL(new Blob([bytes],{type:'audio/wav'}));bgmEl.idle.src=url;
    setBgmDucked(false);startBgm('idle');await bgmEl.idle.play();
    const analyser=c.createAnalyser();bgmGains.get(bgmEl.idle).connect(analyser);analyser.fftSize=2048;
    const wait=()=>new Promise(r=>setTimeout(r,150)),rms=()=>{const data=new Float32Array(2048);analyser.getFloatTimeDomainData(data);return Math.sqrt(data.reduce((sum,v)=>sum+v*v,0)/data.length);};
    await wait();const normal=rms();revealScroll();await wait();const ducked=rms();
    const openingRate=scrollVideo().playbackRate;
    const openingMuted=scrollVideo().muted,sharedOpening=openingAudioActive&&!openingNativeAudio;
    openingAudioActive=false;scrollVideo().pause();ScrollSound.stop();
    setBgmDucked(false);await wait();const restored=rms();bgmEl.idle.pause();
    const fxAnalyser=c.createAnalyser(),createGain=c.createGain.bind(c);
    c.createGain=()=>{const gain=createGain();gain.connect(fxAnalyser);return gain;};
    const buffer=c.createBuffer(1,c.sampleRate,c.sampleRate),channel=buffer.getChannelData(0);
    for(let i=0;i<channel.length;i++)channel[i]=.5*Math.sin(i*2*Math.PI*660/c.sampleRate);
    sfxBuf.special=buffer;playSfx('fanfare');await wait();
    const data=new Float32Array(fxAnalyser.fftSize);fxAnalyser.getFloatTimeDomainData(data);const effect=Math.sqrt(data.reduce((sum,v)=>sum+v*v,0)/data.length);
    c.createGain=createGain;analyser.disconnect();fxAnalyser.disconnect();URL.revokeObjectURL(url);
    return {normal,ducked,restored,effect,openingRate,openingMuted,sharedOpening};
  });
  assert.ok(measured.normal>.05);assert.ok(Math.abs(measured.ducked/measured.normal-.25)<.03,JSON.stringify(measured));
  assert.equal(measured.openingRate,1.8);assert.equal(measured.openingMuted,true);assert.equal(measured.sharedOpening,true);
  assert.ok(Math.abs(measured.restored/measured.normal-1)<.08);assert.ok(measured.effect>.1);
  console.log('PASS: real WebAudio RMS verifies 25% BGM attenuation/restoration and audible uploaded fanfare signal',measured);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());
