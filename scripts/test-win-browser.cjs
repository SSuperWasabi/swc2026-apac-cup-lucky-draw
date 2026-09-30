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

  // 5) Win sounds follow the grade: 상급 = 스페셜 (fanfare), 일반 = 일반당첨 (win), 참가상 = 참가상 (participation).
  const sfxFor=async kind=>{
   await page.waitForFunction(()=>currentScreen==='scr-idle',null,{timeout:10000});
   await start({kind});await page.evaluate(()=>{window.__sfx=[];});
   await page.locator('#scroll-drag').focus();await page.keyboard.press('Enter');
   await page.waitForFunction(()=>currentScreen==='scr-result',null,{timeout:15000});
   const got=await page.evaluate(()=>window.__sfx.filter(k=>k!=='pick'));
   await page.evaluate(()=>resetToIdle());return got;};
  assert.deepEqual(await sfxFor('figure'),['fanfare'],'상급 plays the special win sound');
  assert.deepEqual(await sfxFor('normal'),['win'],'일반 plays the normal win sound');
  assert.deepEqual(await sfxFor('participation'),['participation'],'참가상 plays the 참가상 sound');
  // The admin 참가상 slot decodes an upload, and 삭제 drops it at once (falls back to the built-in tone).
  const slot=await page.evaluate(async()=>{const buf=await(await fetch('assets/figure/zeratu-summon.wav')).arrayBuffer();await idbPut('sfx_participation',{buf,type:'audio/wav'});await loadSfx();
   const loaded=!!sfxBuf.participation;await delMedia('sfx_participation');renderAdmSettings();return {loaded,afterDelete:!!sfxBuf.participation,row:!!document.querySelector('[onclick*="sfx_participation"]')};});
  assert.deepEqual(slot,{loaded:true,afterDelete:false,row:true});
  console.log('PASS: 상급 -> 스페셜, 일반 -> 일반당첨, 참가상 -> 참가상 효과음 (admin slot decodes uploads, 삭제 clears)');

  // 6) An effect sound uploaded through the admin is stored as WAV with its file name (plays on iPad even when the
  //    source format is PC-only), the row shows it, and an undecodable slot is flagged.
  const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.evaluate(()=>{uploadMedia('sfx_win','audio/*');})]);
  await chooser.setFiles(path.resolve('app/assets/figure/zeratu-summon.wav'));
  await page.waitForFunction(()=>document.querySelector('.sfx-status[data-sfx=win]')?.textContent.startsWith('✓'),null,{timeout:10000});
  const sfx=await page.evaluate(async()=>{const d=await idbGet('sfx_win');
   await idbPut('sfx_pick',{buf:new Uint8Array(16).buffer,type:'audio/ogg',name:'broken.ogg'});await loadSfx();renderAdmSettings();
   return {type:d.type,name:d.name,row:document.querySelector('.sfx-status[data-sfx=win]').textContent,bad:document.querySelector('.sfx-status[data-sfx=pick]').className};});
  assert.equal(sfx.type,'audio/wav');assert.equal(sfx.name,'zeratu-summon.wav');assert.match(sfx.row,/^✓ zeratu-summon\.wav · \d+\.\d초$/);assert.match(sfx.bad,/sfx-bad/);
  await page.evaluate(()=>delMedia('sfx_pick'));
  console.log('PASS: effect-sound upload stored as WAV with its name; admin rows show registered/default/unplayable');

  // 7) With a product video the win sound waits for the product's entrance (AE PRIZE REVEAL in at 1.4 s, video clock).
  await page.evaluate(()=>{resetToIdle();cfg.resultReturnSec=7;window.__sfxAt=[];const base=playSfx;playSfx=k=>{window.__sfxAt.push([k,winScreen.video.currentTime,currentScreen]);return base(k);};});
  await page.waitForFunction(()=>currentScreen==='scr-idle',null,{timeout:10000});
  await start({winVideoKey:'test_win',kind:'normal'});
  await page.locator('#scroll-drag').focus();await page.keyboard.press('Enter');
  await page.waitForFunction(()=>currentScreen==='scr-result',null,{timeout:15000});
  await page.waitForFunction(()=>window.__sfxAt.some(x=>x[0]==='win'),null,{timeout:5000});
  const at=await page.evaluate(()=>window.__sfxAt.find(x=>x[0]==='win'));
  assert.ok(at[1]>=1.35&&at[1]<2.2,`win sound at video t=${at[1]} (product entrance 1.4 s)`);
  console.log('PASS: win sound plays as the product appears on the win video (t=%s s)',at[1].toFixed(3));

  // 8) Per-file volume: sliders under each BGM slot / effect sound, saved, applied to the BGM gain and effect gain.
  await page.evaluate(()=>{resetToIdle();renderAdmSettings();});
  const vol=await page.evaluate(async()=>{
   const rows=[...document.querySelectorAll('.vol-row')].map(r=>r.dataset.key);
   setSoundVolume('bgm_idle',50);setSoundVolume('sfx_win',150);
   const a=bgmEl.idle;a.src=a.src||'assets/figure/zeratu-summon.wav';syncBgmGain(a);await new Promise(r=>setTimeout(r,50));
   let gainSet=null;const c=audioCtx(),orig=c.createGain.bind(c);c.createGain=()=>{const g=orig();gainSet=g;return g;};
   sfxBuf.win=c.createBuffer(1,800,8000);cfg.muted=false;playSfxReady('win',c);c.createGain=orig;cfg.muted=true;delete sfxBuf.win;
   return {rows,saved:JSON.parse(localStorage.getItem('swc2026-apac-lucky-draw.config.v1')).soundVolumes,bgmGain:+bgmGains.get(a).gain.value.toFixed(3),sfxGain:+gainSet.gain.value.toFixed(3),out:document.querySelector('.vol-row[data-key=bgm_idle] output').textContent};});
  assert.deepEqual(vol.rows,['bgm_all','bgm_idle','bgm_select','bgm_play','sfx_all','sfx_pick','sfx_win','sfx_special','sfx_participation','sfx_scene']);
  assert.deepEqual(vol.saved,{bgm_idle:50,sfx_win:150});assert.equal(vol.bgmGain,.2);assert.equal(vol.sfxGain,1.2);assert.equal(vol.out,'50%');
  console.log('PASS: volume sliders for every BGM slot and effect sound; saved and applied (BGM 50% -> gain .2, 일반당첨 150% -> gain 1.2)');

  // 9) Admin grade is an A-H dropdown (display grade), separate from the draw class.
  const grade=await page.evaluate(()=>{renderAdmIps();const sel=document.querySelector('#pane-ips .grade-select');sel.value='B';sel.onchange();return {options:[...sel.options].map(o=>o.value),saved:cfg.ips[0].prizes[0].grade};});
  assert.deepEqual(grade.options.slice(0,9),['','A','B','C','D','E','F','G','H']);assert.equal(grade.saved,'B');
  console.log('PASS: admin grade is an A-H dropdown and edits the prize grade');

  // 10) A·B 등급: 축하 화면(전용 칸, 축하음) -> 특별 영상(축하 화면 동안 미리 준비) -> 상품 영상. 등급 배지는 상품 등장(1.4초)과 함께.
  await page.evaluate(()=>{resetToIdle();cfg.resultReturnSec=7;});
  await page.waitForFunction(()=>currentScreen==='scr-idle',null,{timeout:10000});
  await page.waitForFunction(()=>congratsSoundReady&&congratsUrls.A,null,{timeout:8000});
  await start({grade:'A',kind:'figure',specialVideoKey:'test_special',winVideoKey:'test_win'});
  // 매 프레임 화면에 보이는 것을 기록한다: 흰 화면, 축하 화면, 특별 영상, 제라툴 기본 영상(보이면 안 됨).
  await page.evaluate(()=>{window.__seen=[];window.__leak=[];window.__liftAt=null;window.__switch=null;
    const oc=ScrollSound.cue;window.__cues=[];ScrollSound.cue=function(n,...x){if(window.__cues.at(-1)!==n)window.__cues.push(n);return oc.call(this,n,...x);};
    const w=document.getElementById('scroll-whiteout'),st=document.getElementById('summon-stage'),v=document.getElementById('summon-video'),c=document.getElementById('congrats-video');
    c.addEventListener('ended',()=>{window.__switch={ended:performance.now()};},{once:true});
    const tick=()=>{if(currentScreen==='scr-result')return;
      if(st.classList.contains('active')){const white=Number(getComputedStyle(w).opacity),cg=st.classList.contains('congrats'),loading=st.classList.contains('loading'),src=v.currentSrc||'';
        const what=cg?(c.readyState>=2?'축하':'축하(준비 중)'):loading?'가림':src.startsWith('blob:')?'특별':'제라툴';
        if(white<.99&&window.__liftAt===null)window.__liftAt=what;
        if(white<.99&&window.__seen.at(-1)!==what)window.__seen.push(what);
        if(white<.99&&(what==='제라툴'||what==='축하(준비 중)'))window.__leak.push(what);
        if(window.__switch&&!window.__switch.shown&&!cg)window.__switch={...window.__switch,shown:performance.now(),t:v.currentTime,ready:v.readyState};}
      requestAnimationFrame(tick);};requestAnimationFrame(tick);});
  await page.locator('#scroll-drag').focus();await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.getElementById('summon-stage').classList.contains('congrats'),null,{timeout:15000});
  const first=await page.evaluate(()=>({grade:document.getElementById('congrats-video').dataset.grade,blob:document.getElementById('congrats-video').currentSrc.startsWith('blob:'),decoded:ScrollSound.has('congrats'),queued:summonQueue.length,preload:document.getElementById('summon-video').getAttribute('src').startsWith('blob:')}));
  assert.deepEqual(first,{grade:'A',blob:true,decoded:true,queued:1,preload:true},'A 등급은 축하 화면(메모리에 받아 둔 영상, 축하음 디코딩)부터, 그동안 특별 영상을 밑에서 준비');
  await page.waitForFunction(()=>currentScreen==='scr-result',null,{timeout:20000});
  const cg=await page.evaluate(()=>({seen:window.__seen,leak:window.__leak,liftAt:window.__liftAt,sw:window.__switch,dur:document.getElementById('congrats-video').duration}));
  assert.deepEqual(cg.seen.slice(0,2),['축하','특별'],'보이는 순서: 축하 화면 -> 특별 영상(사이에 빈 화면 없음)');
  assert.deepEqual(cg.leak,[],'축하 영상 전·영상 사이에 제라툴 소환 영상이나 빈 칸이 보이지 않음');
  assert.deepEqual(await page.evaluate(()=>window.__cues.filter(n=>n==='congrats'||n.startsWith('special:'))),['congrats','special:test_special'],'소리: 축하음 -> 특별 영상 소리(미리 준비 중에는 소리 없음)');
  assert.equal(cg.liftAt,'축하','흰 화면은 축하 영상 첫 장면이 나온 뒤에 걷힘');
  assert.ok(cg.dur>=1.75&&cg.dur<=1.85,`축하 화면 길이 ${cg.dur}초`);
  const gap=cg.sw.shown-cg.sw.ended;
  assert.ok(gap<200,`축하 화면이 끝나고 특별 영상으로 바뀌기까지 ${gap.toFixed(0)}ms`);
  console.log('PASS: 축하 화면 %s초 -> 특별 영상: 흰 화면은 축하 첫 장면 뒤에 걷히고, 제라툴·빈 칸 없이 %sms 만에 이어짐',cg.dur.toFixed(2),gap.toFixed(0));
  await page.waitForFunction(()=>document.getElementById('win-grade').classList.contains('is-in'),null,{timeout:5000});
  const badge=await page.evaluate(()=>{const b=document.getElementById('win-grade');return {grade:b.dataset.grade,t:winScreen.video.currentTime,hidden:b.hidden,bg:getComputedStyle(b).backgroundImage.includes('grade-A.png')};});
  assert.equal(badge.grade,'A');assert.equal(badge.hidden,false);assert.equal(badge.bg,true);assert.ok(badge.t>=1.35&&badge.t<2.2,`배지가 상품 등장 시점에 나타남(영상 ${badge.t}초)`);
  console.log('PASS: A 등급: 축하 화면(축하음) -> 특별 영상 -> 상품 영상, 등급 배지 A가 영상 %s초(상품 등장)에 나타남',badge.t.toFixed(3));

  // 10-2) 특별 영상이 없는 B 등급: 축하 화면 -> 바로 상품 영상.
  await page.evaluate(()=>{resetToIdle();});
  await page.waitForFunction(()=>currentScreen==='scr-idle',null,{timeout:10000});
  await start({grade:'B',kind:'figure',winVideoKey:'test_win'});
  await page.locator('#scroll-drag').focus();await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.getElementById('summon-stage').classList.contains('congrats'),null,{timeout:15000});
  const b2=await page.evaluate(()=>({grade:document.getElementById('congrats-video').dataset.grade,queued:summonQueue.length}));
  await page.waitForFunction(()=>currentScreen==='scr-result',null,{timeout:10000});
  await page.waitForFunction(()=>!document.getElementById('summon-stage').classList.contains('active'),null,{timeout:3000});
  assert.deepEqual(b2,{grade:'B',queued:0},'B 등급(특별 영상 없음)은 축하 화면만');
  console.log('PASS: 특별 영상이 없는 B 등급: 축하 화면 -> 바로 상품 영상, 연출 칸 정리됨');

  // 11) C 등급: 축하 화면 없이 바로 상품 영상, 배지는 같은 자리에 C.
  await page.evaluate(()=>{resetToIdle();window.__clips=[];});
  await page.waitForFunction(()=>currentScreen==='scr-idle',null,{timeout:10000});
  await start({grade:'C',kind:'normal',winVideoKey:'test_win'});
  await page.locator('#scroll-drag').focus();await page.keyboard.press('Enter');
  await page.waitForFunction(()=>currentScreen==='scr-result',null,{timeout:20000});
  await page.waitForFunction(()=>document.getElementById('win-grade').classList.contains('is-in'),null,{timeout:5000});
  const c=await page.evaluate(()=>({clips:window.__clips.length,grade:document.getElementById('win-grade').dataset.grade,box:(()=>{const b=document.getElementById('win-grade'),f=b.offsetParent;return [Math.round(b.offsetLeft/f.offsetWidth*100),Math.round(b.offsetTop/f.offsetHeight*100),Math.round(b.offsetWidth/f.offsetWidth*100)];})() /* 등장 애니메이션의 확대·축소와 무관한 배치 위치 */}));
  assert.deepEqual(c,{clips:0,grade:'C',box:[73,9,18]},'C 등급은 축하 화면 없음, 배지 위치는 모든 등급 동일');
  console.log('PASS: C 등급: 축하 화면 없이 상품 영상, 배지 C가 같은 자리(가로 73%, 세로 9%, 폭 18%)');
  assert.deepEqual(errors,[]);
 } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
