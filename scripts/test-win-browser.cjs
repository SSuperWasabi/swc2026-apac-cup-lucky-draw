// Real Chrome journey to the OAP v5 win screen: figure win -> full-screen AE win video, staff check, 5 s return.
const {chromium}=require('../.tools/node_modules/playwright-core');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
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
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1024,height:1366},serviceWorkers:'block'});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'load'});
  await page.evaluate(()=>{cfg.muted=true;
   window.__confetti=0;new MutationObserver(()=>window.__confetti++).observe(document.getElementById('confetti'),{childList:true});
   // Video position when the result screen becomes active (the white lifts right after).
   new MutationObserver(()=>{const r=document.getElementById('scr-result');if(r.classList.contains('active')&&window.__winAtEntry===undefined)window.__winAtEntry=document.getElementById('win-video').currentTime;}).observe(document.getElementById('scr-result'),{attributes:true,attributeFilter:['class']});});
  // One full journey: start -> choose -> automatic open -> cinematic clip -> v5 win video -> 5 s home.
  const win=async(label,exit)=>{
   await page.evaluate(()=>{stock={ip1:[1,0]};refreshIdleSoldout();window.__winAtEntry=undefined;});
   await page.locator('#idle-banner').click();
   await page.waitForFunction(()=>document.getElementById('choose-stage').classList.contains('is-interactive'),null,{timeout:5000});
   await page.locator('#scroll-grid .scroll-choice').first().click();await page.locator('#scroll-next').click();await page.waitForTimeout(800);
   await page.locator('#scroll-drag').focus();await page.keyboard.press('Enter'); // automatic 1.8x opening
   await page.waitForFunction(()=>document.getElementById('summon-stage').classList.contains('active'),null,{timeout:15000});
   const clip=await page.evaluate(()=>{const v=document.getElementById('summon-video');return {blob:v.currentSrc.startsWith('blob:'),src:v.getAttribute('src'),screen:currentScreen,win:document.getElementById('scr-result').classList.contains('oap-win')&&currentScreen==='scr-result'};});
   assert.equal(clip.screen,'scr-open','cinematic plays before the result');
   await page.waitForFunction(()=>!document.getElementById('summon-video').paused&&document.getElementById('summon-video').currentTime>0.3,null,{timeout:10000});
   await page.waitForFunction(()=>currentScreen==='scr-result',null,{timeout:20000});
   const entered=Date.now();
   if(exit==='idle'){await page.waitForTimeout(500);await page.mouse.click(512,700);assert.equal(await page.evaluate(()=>currentScreen),'scr-result','a tap during the entrance (<2.5 s) is ignored');await page.waitForTimeout(2700);}
   else await page.waitForTimeout(3200); // staff check fades in 2.4-2.8 s
   const s=await page.evaluate(()=>{const v=document.getElementById('win-video');return {win:document.getElementById('scr-result').classList.contains('oap-win'),playing:!v.paused,ready:v.readyState,frame:v.videoWidth,
    atEntry:window.__winAtEntry,t:v.currentTime,staff:document.getElementById('win-staff').textContent,staffOpacity:getComputedStyle(document.getElementById('win-staff')).opacity,
    confetti:window.__confetti,log:logArr.at(-1),stock:JSON.stringify(stock),cover:(()=>{const r=document.getElementById('win-stage').getBoundingClientRect();return [r.width,r.height];})()};});
   assert.equal(s.win,true);assert.equal(s.playing,true);assert.ok(s.ready>=2&&s.frame===1024,`${label}: win video has decoded frames (readyState ${s.ready})`);
   assert.ok(s.t>2.5,`${label}: win video advancing (t=${s.t})`);assert.equal(s.confetti,0);
   assert.ok(s.atEntry<0.2,`win video starts at its first frame (t=${s.atEntry} at result entry)`);
   assert.deepEqual(s.cover,[1024,1366]);assert.equal(s.log.kind,'figure');assert.equal(s.stock,'{"ip1":[0,0]}');
   assert.match(s.staff,new RegExp(`^SHOW THIS SCREEN TO STAFFNo\\. ${s.log.serial} · \\d\\d:\\d\\d:\\d\\d$`));assert.equal(s.staffOpacity,'1');
   await page.screenshot({path:`.tools/win-v5-${label}.png`});
   if(exit==='tap'){const t=Date.now();await page.mouse.click(512,700);await page.waitForFunction(()=>currentScreen==='scr-idle',null,{timeout:1500});assert.ok(Date.now()-t<1000,'tap after the entrance returns home at once');}
   else await page.waitForFunction(()=>currentScreen==='scr-idle',null,{timeout:10000});
   const back=(Date.now()-entered)/1000;
   if(exit==='idle')assert.ok(back>6.5&&back<7.8,`seven-second return on the win screen (${back}s)`);
   const after=await page.evaluate(()=>({paused:document.getElementById('win-video').paused,t:document.getElementById('win-video').currentTime,src:document.getElementById('win-video').getAttribute('src'),summonSrc:document.getElementById('summon-video').getAttribute('src')}));
   assert.deepEqual({paused:after.paused,t:after.t},{paused:true,t:0});assert.ok(after.src,'win video source kept for the next winner');
   return {clip,atEntry:s.atEntry,serial:s.log.serial,back,summonSrcAfter:after.summonSrc};
  };
  const a=await win('bundled','idle');
  assert.equal(a.clip.blob&&!a.clip.src.startsWith('blob:'),false);
  console.log('PASS: win 1 (bundled Zeratu cinematic) -> v5 win video from t=%s s, staff No. %s, home after %s s (early tap ignored, 7 s idle return)',a.atEntry.toFixed(3),a.serial,a.back.toFixed(1));
  // Register a prize clip (admin 상품 영상): it replaces the bundled cinematic; the v5 video must still play on this second win.
  await page.evaluate(async()=>{const buf=await(await fetch('assets/figure/sacred-idle.mp4')).arrayBuffer();await idbPut('prize_clip_test',{buf,type:'video/mp4'});cfg.ips[0].prizes[0].videoKey='prize_clip_test';});
  const b=await win('registered','tap');
  assert.equal(b.clip.blob,true,'registered clip plays as the cinematic');
  assert.ok(!b.summonSrcAfter.startsWith('blob:')||b.summonSrcAfter!==b.clip.src,'bundled cinematic source restored after a registered clip');
  console.log('PASS: win 2 (registered prize clip) -> v5 win video still plays (t=%s s at entry), staff No. %s; tap after the entrance returned home at %s s; bundled clip source restored',b.atEntry.toFixed(3),b.serial,b.back.toFixed(1));
  assert.deepEqual(errors,[]);
 } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
