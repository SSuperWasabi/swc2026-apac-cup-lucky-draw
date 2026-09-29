// Real Chrome journeys through the winning-prize media set per prize in admin (IndexedDB):
// 특별 영상 (cinematic, optional) -> 당첨 영상 (OAP v5 win screen, optional) -> 결과 복귀(초).
const {chromium}=require('../.tools/node_modules/playwright-core');
const {spawnSync}=require('node:child_process');
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
// Stand-ins: the bundled Zeratu summon clip (7 s, AAC audio) as 특별 영상, and the 5 s 1024x1366 open-frame
// loop as 당첨 영상 (the real v5 renders are uploaded by operators, see resource/oap/upload-ready).
const SPECIAL='assets/figure/zeratu-summon.mp4',WIN='assets/oap/open/open-frame-loop.mp4';
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1024,height:1366},serviceWorkers:'block'});
  // Immediate screen swaps: the transition has its own suite (test-transition-browser). In-memory only.
  await page.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{if(typeof cfg!=='undefined')cfg.screenTransitions=false;}));
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const base=`http://127.0.0.1:${server.address().port}/`;
  await page.goto(base,{waitUntil:'load'});
  await page.waitForFunction(()=>typeof idb!=='undefined'&&idb);

  // v6 kept a winning prize's cinematic in 상품 영상; on load it moves to 특별 영상.
  await page.evaluate(()=>{cfg.ips[0].prizes[0].videoKey='legacy_clip';saveCfg();});
  await page.reload({waitUntil:'load'});await page.waitForFunction(()=>typeof idb!=='undefined'&&idb);
  assert.deepEqual(await page.evaluate(()=>({special:cfg.ips[0].prizes[0].specialVideoKey,video:cfg.ips[0].prizes[0].videoKey??null})),{special:'legacy_clip',video:null});
  console.log('PASS: a winning prize\'s old 상품 영상 migrates to 특별 영상');

  await page.evaluate(async([special,win])=>{
   cfg.muted=true;
   for(const [key,url] of [['test_special',special],['test_win',win]]){const buf=await(await fetch(url)).arrayBuffer();await idbPut(key,{buf,type:'video/mp4'});}
   window.__confetti=0;new MutationObserver(()=>window.__confetti++).observe(document.getElementById('confetti'),{childList:true});
   new MutationObserver(()=>{const r=document.getElementById('scr-result');if(r.classList.contains('active')&&window.__winAtEntry===undefined)window.__winAtEntry=document.getElementById('win-video').currentTime;}).observe(document.getElementById('scr-result'),{attributes:true,attributeFilter:['class']});
  },[SPECIAL,WIN]);

  const start=async(media)=>{
   await page.evaluate(media=>{const p=cfg.ips[0].prizes[0];delete p.specialVideoKey;delete p.winVideoKey;Object.assign(p,media);saveCfg();stock={ip1:[1,0]};refreshIdleSoldout();window.__winAtEntry=undefined;},media);
   await page.locator('#idle-banner').click();
   await page.waitForFunction(()=>document.getElementById('choose-stage').classList.contains('is-interactive'),null,{timeout:5000});
   await page.locator('#scroll-grid .scroll-choice').first().click();await page.locator('#scroll-next').click();await page.waitForTimeout(800);
  };
  const winState=()=>page.evaluate(()=>{const v=document.getElementById('win-video');return {win:document.getElementById('scr-result').classList.contains('oap-win'),playing:!v.paused,ready:v.readyState,w:v.videoWidth,t:v.currentTime,atEntry:window.__winAtEntry,
   staff:document.getElementById('win-staff').textContent,serial:logArr.at(-1).serial,stock:JSON.stringify(stock),confetti:window.__confetti};});

  // 1) 특별 + 당첨 영상, automatic opening: cinematic with Web Audio sound, then the win screen; 7 s idle return.
  await start({specialVideoKey:'test_special',winVideoKey:'test_win'});
  await page.locator('#scroll-drag').focus();await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.getElementById('summon-stage').classList.contains('active'),null,{timeout:15000});
  const specialSrc=await page.evaluate(()=>document.getElementById('summon-video').getAttribute('src'));
  const clip=await page.evaluate(()=>({screen:currentScreen,src:document.getElementById('summon-video').currentSrc.startsWith('blob:'),decoded:ScrollSound.has('special:test_special'),videoMuted:document.getElementById('summon-video').muted}));
  assert.deepEqual(clip,{screen:'scr-open',src:true,decoded:true,videoMuted:true},'cinematic from 특별 영상, sound through Web Audio');
  await page.waitForFunction(()=>currentScreen==='scr-result',null,{timeout:20000});
  let entered=Date.now();
  await page.waitForTimeout(500);await page.mouse.click(512,700);
  assert.equal(await page.evaluate(()=>currentScreen),'scr-result','a tap during the entrance (<2.5 s) is ignored');
  await page.waitForTimeout(2700);
  let s=await winState();
  assert.equal(s.win,true);assert.equal(s.playing,true);assert.ok(s.ready>=2&&s.w===1024,`win video decoded (readyState ${s.ready})`);assert.ok(s.atEntry<0.2,`win video from its first frame (t=${s.atEntry})`);
  assert.equal(s.confetti,0);assert.equal(s.stock,'{"ip1":[0,0]}');
  assert.match(s.staff,new RegExp(`^SHOW THIS SCREEN TO STAFFNo\\. ${s.serial} · \\d\\d:\\d\\d:\\d\\d$`));
  await page.screenshot({path:'.tools/win-special-then-win.png'});
  await page.waitForFunction(()=>currentScreen==='scr-idle',null,{timeout:10000});
  let back=(Date.now()-entered)/1000;assert.ok(back>6.5&&back<7.9,`결과 복귀 7 s after the last input (${back}s)`);
  assert.deepEqual(await page.evaluate(()=>({paused:document.getElementById('win-video').paused,t:document.getElementById('win-video').currentTime,restored:document.getElementById('summon-video').getAttribute('src')})),{paused:true,t:0,restored:await page.evaluate(()=>summonDefaultSrc===null?document.getElementById('summon-video').getAttribute('src'):null)});
  assert.notEqual(await page.evaluate(()=>document.getElementById('summon-video').getAttribute('src')),specialSrc,'bundled summon source restored after the special clip');
  console.log('PASS: 특별 영상 (decoded audio) -> 당첨 영상 from t=%s s; early tap ignored; home after %s s',s.atEntry.toFixed(3),back.toFixed(1));

  // 2) 당첨 영상 only, completed drag (no head start): the white holds until the win video can show a frame.
  await start({winVideoKey:'test_win'});
  await page.evaluate(()=>{const v=document.getElementById('win-video');v.removeAttribute('src');v.load();winScreen.key=null;winScreen.url=null;}); // force a cold read
  const r=await page.locator('#scroll-drag').boundingBox();
  await page.mouse.move(r.x+r.width*0.1,r.y+r.height*0.5);await page.mouse.down();
  for(let i=1;i<=20;i++){await page.mouse.move(r.x+r.width*(0.1+0.85*i/20),r.y+r.height*0.5);await page.waitForTimeout(30);}
  await page.mouse.up();
  await page.waitForFunction(()=>currentScreen==='scr-result',null,{timeout:10000});
  assert.equal(await page.evaluate(()=>document.getElementById('summon-stage').classList.contains('active')),false,'no cinematic without 특별 영상');
  entered=Date.now();
  await page.waitForTimeout(3000);
  s=await winState();
  assert.equal(s.win,true);assert.ok(s.ready>=2&&s.w===1024);assert.ok(s.atEntry<0.2,`cold win video still starts at its first frame (t=${s.atEntry})`);
  const t=Date.now();await page.mouse.click(512,700);
  await page.waitForFunction(()=>currentScreen==='scr-idle',null,{timeout:1500});assert.ok(Date.now()-t<1000,'tap after the entrance returns home at once');
  console.log('PASS: 당첨 영상 only, completed drag: white held until ready, win video from t=%s s; tap after the entrance returned home',s.atEntry.toFixed(3));

  // 3) 결과 복귀(초) setting drives the win screen too.
  await page.evaluate(()=>{cfg.resultReturnSec=4;});
  await start({winVideoKey:'test_win'});
  await page.locator('#scroll-drag').focus();await page.keyboard.press('Enter');
  await page.waitForFunction(()=>currentScreen==='scr-result',null,{timeout:15000});entered=Date.now();
  await page.waitForFunction(()=>currentScreen==='scr-idle',null,{timeout:8000});back=(Date.now()-entered)/1000;
  assert.ok(back>3.5&&back<4.8,`결과 복귀 4 s applied (${back}s)`);
  console.log('PASS: 결과 복귀(초)=4 returns the win screen after %s s',back.toFixed(1));

  // 4) A 특별 영상 longer than 11 s plays to its end (the watchdog must follow the real duration, not an 8 s guess).
  const longClip=path.resolve('.tools/fixtures/special-15s.mp4');
  if(!fs.existsSync(longClip)){fs.mkdirSync(path.dirname(longClip),{recursive:true});
   spawnSync(path.resolve('.tools/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe'),['-nostdin','-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc2=size=540x720:rate=30:duration=15','-f','lavfi','-i','sine=frequency=440:duration=15','-c:v','libx264','-pix_fmt','yuv420p','-crf','30','-c:a','aac','-b:a','64k','-movflags','+faststart',longClip]);}
  await page.evaluate(async b64=>{const bin=atob(b64),buf=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)buf[i]=bin.charCodeAt(i);await idbPut('test_long',{buf:buf.buffer,type:'video/mp4'});},fs.readFileSync(longClip).toString('base64'));
  await page.evaluate(()=>{cfg.resultReturnSec=7;window.__sfx=[];const base=playSfx;playSfx=k=>{window.__sfx.push(k);return base(k);};});
  await start({specialVideoKey:'test_long',kind:'figure'});
  await page.locator('#scroll-drag').focus();await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.getElementById('summon-stage').classList.contains('active'),null,{timeout:15000});
  await page.evaluate(()=>{window.__summonEnd=null;new MutationObserver(()=>{if(currentScreen==='scr-result'&&window.__summonEnd===null)window.__summonEnd=document.getElementById('summon-video').currentTime;}).observe(document.getElementById('scr-result'),{attributes:true,attributeFilter:['class']});});
  await page.waitForFunction(()=>currentScreen==='scr-result',null,{timeout:25000});
  const endAt=await page.evaluate(()=>window.__summonEnd);
  assert.ok(endAt>14.8,`15 s 특별 영상 played to its end (left at t=${endAt})`);
  console.log('PASS: 15 s 특별 영상 plays to the end (result at t=%s s)',endAt.toFixed(2));

  // 5) Win sounds follow the grade: 상급 = 스페셜 당첨음 (fanfare), 일반 = 일반 당첨음 (win), 참가상 = none.
  const sfxFor=async kind=>{
   await page.waitForFunction(()=>currentScreen==='scr-idle',null,{timeout:10000});
   await start({kind});await page.evaluate(()=>{window.__sfx=[];});
   await page.locator('#scroll-drag').focus();await page.keyboard.press('Enter');
   await page.waitForFunction(()=>currentScreen==='scr-result',null,{timeout:15000});
   const got=await page.evaluate(()=>window.__sfx.filter(k=>k!=='pick'));
   await page.evaluate(()=>resetToIdle());return got;};
  assert.deepEqual(await sfxFor('figure'),['fanfare'],'상급 plays the special win sound');
  assert.deepEqual(await sfxFor('normal'),['win'],'일반 plays the normal win sound');
  assert.deepEqual(await sfxFor('participation'),[],'참가상 plays no win sound');
  console.log('PASS: 상급 -> 스페셜 당첨음, 일반 -> 일반 당첨음, 참가상 -> no win sound');
  assert.deepEqual(errors,[]);
 } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
