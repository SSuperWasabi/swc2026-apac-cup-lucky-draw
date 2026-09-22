/* Figure Draw participant journey. v31 admin/media/backup remains the base. */
document.getElementById('idle-version').textContent=APP_VER;
let selectedScroll=null, openingFrame=0, openingTimer=null, resultTick=null, resultDeadline=0;
let figureMediaUrls=[], figurePopup=null, figureEpoch=0;
const figureBase={renderAdmIps,renderAdmSettings,renderResult,resetToIdle,bootIdle,go,startBgm};
const resultLoop=new PreparedResultVideo(document.getElementById('result-loop-video'),visible=>document.getElementById('scr-result').classList.toggle('using-result-loop',visible));
window.resultVideoDiagnostics=resultLoop.diagnostics;
let resultPrepareTimer=null;
// Cache only the unique participation clip; multiple clips retain the legacy path.
function participationVideoKey(){
  const keys=new Set();
  for(const ip of cfg.ips||[])for(const p of ip.prizes||[]){
    if(p.hidden||(p.kind||(p.tier==='high'?'figure':'participation'))!=='participation')continue;
    const media=isBundle(p)?p.subs:[p];
    for(const item of media){const key=item.videoKey||p.videoKey;if(key)keys.add(key);}
  }
  return keys.size===1?[...keys][0]:null;
}
function reusableResultKey(result){const key=(result.media||result.prize).videoKey;return !result.high&&key&&key===participationVideoKey()?key:null;}
function scheduleResultLoop(){
  clearTimeout(resultPrepareTimer);resultPrepareTimer=null;
  const key=participationVideoKey();
  if(resultLoop.entry&&resultLoop.entry.key!==key)resultLoop.clear();
  if(!key||!idb||document.hidden||resultLoop.visible||currentScreen==='scr-result')return;
  // Prioritize the current and next main clips; never spin a second hidden loop.
  const pending=[idleDeck.active,idleDeck.next].some(e=>e&&e.state!=='ready'&&e.state!=='failed');
  if(pending||(drawing&&currentScreen==='scr-open')){resultPrepareTimer=setTimeout(scheduleResultLoop,150);return;}
  resultLoop.prepare(key);
}
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){clearTimeout(resultPrepareTimer);resultLoop.suspend();}
  else{resultLoop.resume();scheduleResultLoop();}
});
const figurePercent=()=>Number(cfg.figureWinPercent??10);
const figureProbabilityEnabled=()=>cfg.figureProbabilityEnabled===true;
const activeFigurePercent=()=>figureProbabilityEnabled()?figurePercent():null;
let scrollScrubbing=false,scrollSeekTarget=null;
// Keep the same media element/time in continuous mode; GainNode controls ducking on iPad.
const BGM_SLOTS=['idle','select','play'];
const bgmSingle=()=>cfg.bgmMode==='single';
const bgmSingleSlot=()=>BGM_SLOTS.includes(cfg.bgmSingleSlot)?cfg.bgmSingleSlot:'idle';
startBgm=function(slot){
  if(bgmSingle()){slot=bgmSingleSlot();const a=bgmEl[slot];if(curBgm===slot&&a&&a.src&&!a.paused&&!cfg.muted){syncBgmGain(a);unlockAudio();return;}}
  figureBase.startBgm(slot);
};
const scrollVideo=()=>document.getElementById('scroll-video');
let whiteoutFrame=0;
function scrollMix(active){
  setBgmDucked(active);
}
function scrollWhiteout(value,fade=false){const el=document.getElementById('scroll-whiteout');el.style.transition=fade?'opacity 400ms ease-out':'none';el.style.opacity=String(Math.max(0,Math.min(1,value)));}
function updateScrollWhiteout(time){const duration=scrollVideo().duration;if(Number.isFinite(duration))scrollWhiteout((time-(duration-.3))/.3);}
let scrollSeekReady=false,figureObjectUrls=[],scrollPlaybackFailed=false;
const AUTO_OPEN_RATE=1.8;
let openingAudioActive=false,openingNativeAudio=false;
let scrollPrepareTask=null,scrollAutoPending=false,scrollReadyTimer=null,scrollPrimeTask=null;
let scrollPrimeEpoch=0;
let scrollPreparedUrl=null;
const scrollSource=document.getElementById('scroll-video').getAttribute('src');
// Bounded local diagnostics: no network upload or participant information.
window.scrollMediaDiagnostics=[];
for(const id of ['scroll-idle-video','scroll-video']){
  const video=document.getElementById(id);
  for(const event of ['loadstart','loadedmetadata','loadeddata','playing','pause','stalled','error'])video.addEventListener(event,()=>{
    window.scrollMediaDiagnostics.push({event,id,time:Date.now(),readyState:video.readyState,networkState:video.networkState,currentTime:video.currentTime,error:video.error?.message||'',source:video.currentSrc.startsWith('blob:')?'blob':'url'});
    if(window.scrollMediaDiagnostics.length>80)window.scrollMediaDiagnostics.shift();
  });
}
// Figure win: the full-screen summon clip plays (with sound) before the result screen. Participation prizes skip it.
let summonTimer=null,summonEpoch=-1,summonUnlocked=false,summonTrack=false;
const summonStage=()=>document.getElementById('summon-stage'),summonVideos=()=>[document.getElementById('summon-video'),document.getElementById('summon-video-blur')];
const summonActive=()=>summonStage().classList.contains('active');
// iOS only lets script start audible playback on elements that were loaded inside a user gesture; do it once when the open screen is entered.
function summonUnlock(){if(summonUnlocked)return;summonUnlocked=true;summonVideos().forEach(v=>{try{v.load();}catch{}});}
function hideSummon(){clearTimeout(summonTimer);ScrollSound.stop();summonStage().classList.remove('active','fading');summonVideos().forEach(v=>{v.pause();try{v.currentTime=0;}catch{}});}
function endSummon(epoch){
  if(epoch!==figureEpoch||epoch!==summonEpoch||currentScreen!=='scr-open'||!summonActive())return;
  clearTimeout(summonTimer);summonEpoch=-1;showResult();startResultMedia();
  summonStage().classList.add('fading');summonTimer=setTimeout(()=>{if(summonStage().classList.contains('fading'))hideSummon();},450);
}
function playSummon(epoch){
  const [v,b]=summonVideos();summonEpoch=epoch;clearTimeout(summonTimer);
  summonStage().classList.remove('fading');summonStage().classList.add('active');
  // Web Audio carries the sound (the same path as the scroll sounds); the video's own track is used only as a fallback.
  summonTrack=!ScrollSound.has('summon');
  v.muted=summonTrack?!!cfg.muted:true;v.volume=1;b.muted=true;v.loop=b.loop=false;try{v.currentTime=0;b.currentTime=0;}catch{}
  v.play().catch(()=>endSummon(epoch));b.play().catch(()=>{});
  // Watchdog: a stalled clip must never trap the kiosk on this screen.
  summonTimer=setTimeout(()=>endSummon(epoch),(Number.isFinite(v.duration)&&v.duration>0?v.duration:8)*1000+3000);
}
document.getElementById('summon-video').addEventListener('ended',()=>endSummon(summonEpoch));
// Start the clip audio exactly where the picture (re)starts, and hold it while the picture stalls.
document.getElementById('summon-video').addEventListener('playing',()=>{const v=summonVideos()[0];if(summonActive()&&!summonTrack)ScrollSound.cue('summon',v.currentTime,!!cfg.muted);});
document.getElementById('summon-video').addEventListener('waiting',()=>{if(summonActive()&&!summonTrack)ScrollSound.stop();});
document.getElementById('summon-video').addEventListener('error',()=>endSummon(summonEpoch));
document.getElementById('summon-video').addEventListener('timeupdate',()=>{const [v,b]=summonVideos();if(summonActive()&&b.readyState>=2&&Math.abs(v.currentTime-b.currentTime)>.25){try{b.currentTime=v.currentTime;}catch{}}});
// A complete Blob is seekable even when the local HTTP server has no Range support, and one download can feed several elements.
async function prepareBlobVideo(ids){
  const source=document.getElementById(ids[0]).getAttribute('src');
  const response=await fetch(source);if(!response.ok)throw Error('영상 다운로드 실패');
  const url=URL.createObjectURL(await response.blob());figureObjectUrls.push(url);
  ids.forEach(id=>{const v=document.getElementById(id);v.src=url;v.load();});
}
function prepareScrollVideo(){
  if(scrollPrepareTask)return scrollPrepareTask;
  scrollPrepareTask=(async()=>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
    try{
      const response=await fetch(scrollSource,{signal:controller.signal});if(!response.ok)throw Error('영상 다운로드 실패');
      const blob=await response.blob(),v=scrollVideo();
      const url=URL.createObjectURL(blob);figureObjectUrls.push(url);scrollPreparedUrl=url;
      // Never replace a source under a gesture or an automatic reveal.
      if(currentScreen!=='scr-open'&&!scrollScrubbing&&!drawing){v.src=url;v.load();}
    }catch(error){console.warn('Scroll download: using original video URL',error);}
    finally{clearTimeout(timer);scrollPrepareTask=null;}
  })();
  return scrollPrepareTask;
}
function scrollHasMetadata(){const v=scrollVideo();return Number.isFinite(v.duration)&&v.duration>0&&v.readyState>=1;}
function scrollHasFrame(){return scrollHasMetadata()&&scrollVideo().readyState>=2&&!scrollVideo().seeking&&!scrollVideo().error;}
function primeScrollVideo(){
  const v=scrollVideo();if(scrollPrimeTask||drawing)return;
  const epoch=++scrollPrimeEpoch;
  if(v.error){v.src=scrollSource;v.load();}
  v.muted=true;
  // Invoke play inside the gesture, even when preload has not decoded a frame.
  scrollPrimeTask=v.play().then(()=>{if(epoch!==scrollPrimeEpoch)return;if(!drawing){v.pause();if(scrollScrubbing){setScrollProgress(Number(document.getElementById('scroll-drag').style.getPropertyValue('--progress'))||0);}}})
    .catch(error=>console.warn('Scroll preparation playback failed',error)).finally(()=>{if(epoch===scrollPrimeEpoch)scrollPrimeTask=null;});
}
function cancelScrollWait(){scrollAutoPending=false;clearTimeout(scrollReadyTimer);scrollReadyTimer=null;}
function waitForScroll(){
  clearTimeout(scrollReadyTimer);
  scrollReadyTimer=setTimeout(()=>{if(currentScreen!=='scr-open'||drawing)return;cancelScrollWait();startScrollLoop();toast('영상을 재생하지 못했습니다. 소환서를 다시 터치하거나 자동 오픈을 눌러주세요');},12000);
}
if(typeof fetch==='function'){prepareScrollVideo();prepareBlobVideo(['summon-video','summon-video-blur']).catch(()=>{ /* Progressive playback from the original URL remains. */ });}
window.addEventListener('pagehide',e=>{if(!e.persisted){figureObjectUrls.forEach(url=>URL.revokeObjectURL(url));figureObjectUrls=[];}});
function startScrollLoop(){
  openingAudioActive=false;
  cancelScrollWait();
  scrollPrimeEpoch++;scrollPrimeTask=null;
  ScrollSound.stop();scrollMix(currentScreen==='scr-open');scrollWhiteout(0);
  scrollScrubbing=false;scrollSeekTarget=null;scrollVideo().pause();setScrollProgress(0);
  document.getElementById('scroll-drag').classList.remove('scrubbing');
  // The idle loop keeps the clip's own sound (frames 0-100 of the source), following the admin mute switch.
  // Web Audio carries it (the same path as the drag sound); the video track is unmuted only as a fallback.
  const v=document.getElementById('scroll-idle-video');v.loop=true;v.volume=1;
  const bed=currentScreen==='scr-open'&&ScrollSound.loop(v.currentTime,!!cfg.muted);
  v.muted=bed||!!cfg.muted;
  if(currentScreen==='scr-open')v.play().catch(error=>{
    console.warn('Scroll idle playback failed; retrying muted',error);
    if(currentScreen!=='scr-open'||scrollScrubbing)return;
    v.muted=true;if(v.error)v.load();
    v.play().catch(error=>console.warn('Scroll idle retry failed',error));
  });
}
function beginScrollScrub(){
  const v=scrollVideo();
  v.pause();v.playbackRate=1;v.muted=true;v.loop=false;scrollScrubbing=true;ScrollSound.begin();scrollMix(true);
  const box=document.getElementById('scroll-drag');
  // Hide the previous decoded frame BEFORE requesting the rewind. Seeking is asynchronous.
  box.classList.remove('video-ready');box.classList.add('scrubbing');setScrollProgress(0);
  if(scrollHasFrame()){box.classList.add('video-ready');document.getElementById('scroll-idle-video').pause();}
  else{waitForScroll();if(!v.seeking)primeScrollVideo();}
  return true;
}
function flushScrollSeek(){
  const v=scrollVideo();if(!scrollScrubbing||v.seeking||scrollSeekTarget===null||!Number.isFinite(v.duration)||v.duration<=0)return;
  const target=scrollSeekTarget;scrollSeekTarget=null;
  if(Math.abs(v.currentTime-target)<.002)return;
  try{v.currentTime=target;}catch{scrollSeekTarget=target;}
}
scrollVideo().addEventListener('seeked',flushScrollSeek);
function scrollMediaReady(){
  if(scrollScrubbing&&!scrollAutoPending&&scrollHasMetadata())setScrollProgress(Number(document.getElementById('scroll-drag').style.getPropertyValue('--progress'))||0);
  scrollSeekReady=scrollHasFrame();
  if(!scrollSeekReady)return;
  clearTimeout(scrollReadyTimer);scrollReadyTimer=null;
  if(scrollScrubbing){document.getElementById('scroll-drag').classList.add('video-ready');document.getElementById('scroll-idle-video').pause();}
  if(scrollAutoPending&&currentScreen==='scr-open'&&!drawing){cancelScrollWait();revealScroll();}
}
scrollVideo().addEventListener('loadedmetadata',scrollMediaReady);
scrollVideo().addEventListener('loadeddata',scrollMediaReady);
scrollVideo().addEventListener('canplay',scrollMediaReady);
scrollVideo().addEventListener('seeked',scrollMediaReady);
// Shared ending for both paths: fully white, result screen underneath, then the white lifts.
function finishScrollReveal(){
  openingAudioActive=false;
  ScrollSound.stop();scrollScrubbing=false;scrollSeekTarget=null;scrollVideo().pause();scrollWhiteout(1);clearTimeout(openingTimer);
  const epoch=figureEpoch;
  if(lastResult&&lastResult.high)playSummon(epoch);else{showResult();startResultMedia();}
  whiteoutFrame=requestAnimationFrame(()=>{whiteoutFrame=requestAnimationFrame(()=>{if(epoch===figureEpoch&&(currentScreen==='scr-result'||summonActive()))scrollWhiteout(0,true);});});
}
scrollVideo().addEventListener('ended',()=>{if(drawing&&currentScreen==='scr-open')finishScrollReveal();});
scrollVideo().addEventListener('timeupdate',()=>{if(drawing&&currentScreen==='scr-open')updateScrollWhiteout(scrollVideo().currentTime);});
function scrollPlaybackError(){
  if(!drawing||currentScreen!=='scr-open')return;
  openingAudioActive=false;
  ScrollSound.stop();scrollPlaybackFailed=true;const btn=document.getElementById('scroll-open-btn');btn.disabled=false;btn.textContent='소환 영상 다시 재생';
  toast('영상 재생이 중단되었습니다. 다시 재생해주세요');
}
scrollVideo().addEventListener('error',scrollPlaybackError);
function playOpeningVideo(){
  const v=scrollVideo();scrollSeekTarget=null;scrollScrubbing=false;scrollPlaybackFailed=false;
  openingAudioActive=true;openingNativeAudio=!ScrollSound.has('open');
  ScrollSound.stop();scrollMix(true);unlockAudio();v.muted=openingNativeAudio?!!cfg.muted:true;v.volume=1;
  document.getElementById('scroll-open-btn').disabled=true;
  v.playbackRate=AUTO_OPEN_RATE;v.preservesPitch=false;if("webkitPreservesPitch" in v)v.webkitPreservesPitch=false;
  v.loop=false;v.play().catch(scrollPlaybackError);
}
scrollVideo().addEventListener('playing',()=>{
  if(openingAudioActive&&!openingNativeAudio&&drawing&&currentScreen==='scr-open')ScrollSound.cue('open',scrollVideo().currentTime,!!cfg.muted,false,scrollVideo().playbackRate);
});
for(const event of ['waiting','pause'])scrollVideo().addEventListener(event,()=>{
  if(openingAudioActive&&!openingNativeAudio)ScrollSound.stop();
});
go = function(id){
  if(id!=='scr-result')resultLoop.hide();
  const resultScreen=document.getElementById('scr-result');resultScreen.inert=id!=='scr-result';resultScreen.setAttribute('aria-hidden',String(id!=='scr-result'));
  if(id!=='scr-open'){openingAudioActive=false;cancelScrollWait();scrollPrimeEpoch++;scrollPrimeTask=null;}
  figureBase.go(id);if(id==='scr-idle')syncIdleTitleLayout();
  scheduleResultLoop();
  if(id==='scr-open')startScrollLoop();else{ScrollSound.stop();scrollMix(false);scrollScrubbing=false;scrollSeekTarget=null;scrollVideo().pause();document.getElementById('scroll-idle-video').pause();if(id!=='scr-result'){cancelAnimationFrame(whiteoutFrame);scrollWhiteout(0);}}
};

function figureDrawPolicy(){const gate=FigureDrawEngine.timeGate(cfg,logArr);return {gate,percent:gate.blocked?0:gate.guaranteed?(FigureDrawEngine.candidates(cfg.ips,stock,'figure').length?100:0):activeFigurePercent()};}
function figureAvailable(){const policy=figureDrawPolicy();const state=FigureDrawEngine.availability(cfg.ips,stock,policy.percent);if(!state.ok&&policy.gate.blocked)state.reason=policy.gate.reason+' 참가상 재고를 준비해주세요.';return state;}
refreshIdleSoldout = function(){
  const state=figureAvailable();
  document.getElementById('scr-idle').classList.toggle('soldout',!state.ok);
  document.getElementById('idle-banner').textContent=state.ok?'TOUCH': '이벤트 준비 중 · 스태프에게 문의해주세요';
}
bootIdle = async function(){await figureBase.bootIdle();document.getElementById('idle-sub').textContent='';scheduleResultLoop();} // The idle screen shows the logo lockup only.
function startFigureGame(){
  const state=figureAvailable();if(!state.ok){toast(state.reason);return;}
  selectedScroll=null;
  if(cfg.hideScrollSelection===true){selectedScroll=Math.floor(Math.random()*12);openSelectedScroll();return;}
  startBgm('select');renderScrollSelection();go('scr-scrolls');
}
document.getElementById('scr-idle').addEventListener('click',e=>{
  if(e.target.closest('#admin-tap'))return;
  e.stopImmediatePropagation();startFigureGame();
},true);
function renderScrollSelection(){
  document.getElementById('scroll-grid').innerHTML=Array.from({length:12},(_,i)=>`<button class="scroll-choice" aria-label="${i+1}번 소환서 선택" aria-pressed="${selectedScroll===i}" onclick="chooseScroll(${i})"><img src="assets/figure/scroll.webp" alt=""><span>${String(i+1).padStart(2,'0')}</span></button>`).join('');
  document.getElementById('scroll-status').textContent=selectedScroll==null?'소환서를 선택해주세요':`${selectedScroll+1}번 소환서 선택`;
  document.getElementById('scroll-next').disabled=selectedScroll==null;
}
function chooseScroll(i){selectedScroll=selectedScroll===i?null:i;playSfx('pick');renderScrollSelection();manageIdle();}
function randomScroll(){selectedScroll=Math.floor(Math.random()*12);playSfx('pick');renderScrollSelection();manageIdle();}
function backFromScroll(){if(!drawing){if(cfg.hideScrollSelection===true)resetToIdle();else go('scr-scrolls');}}
function openSelectedScroll(){
  if(selectedScroll==null)return;
  if(scrollPreparedUrl&&scrollVideo().getAttribute('src')!==scrollPreparedUrl){scrollVideo().src=scrollPreparedUrl;scrollVideo().load();}
  drawing=false;setScrollProgress(0);document.getElementById('scr-open').classList.remove('opening');
  document.getElementById('scroll-open-btn').disabled=false;
  document.getElementById('scroll-open-btn').textContent='소환서 자동 오픈';scrollPlaybackFailed=false;
  document.getElementById('open-back').disabled=false;
  document.getElementById('open-number').textContent=`${selectedScroll+1}번 소환서`;
  summonUnlock();startBgm('play');go('scr-open');
}
function setScrollProgress(value){
  const box=document.getElementById('scroll-drag'),progress=Number.isFinite(value)?Math.max(0,Math.min(1,value)):0;
  box.style.setProperty('--progress',progress);
  const chevrons=box.querySelectorAll('.drag-chevron'),activeCount=Math.ceil(progress*chevrons.length);
  chevrons.forEach((chevron,index)=>chevron.classList.toggle('is-active',index<activeCount));
  const v=scrollVideo();
  if(scrollScrubbing&&Number.isFinite(v.duration)&&v.duration>0){scrollSeekTarget=progress*Math.max(0,v.duration-1/30);ScrollSound.scrub(scrollSeekTarget,!!cfg.muted);updateScrollWhiteout(scrollSeekTarget);flushScrollSeek();}
}
manageIdle = function(){
  clearTimeout(idleTimer);
  if(drawing&&currentScreen==='scr-open')return;
  if(currentScreen==='scr-result'){
    if(figurePopup)return;
    resultDeadline=Date.now()+5000;idleTimer=setTimeout(resetToIdle,5000);updateResultCountdown();
  }else if(['scr-scrolls','scr-open','scr-ip','scr-lineup'].includes(currentScreen)){
    idleTimer=setTimeout(resetToIdle,Math.max(3,cfg.idleTimeoutSec||30)*1000);
  }
}
resetIdle = function(){if(currentScreen!=='scr-idle'&&currentScreen!=='scr-admin')manageIdle();}
document.getElementById('kiosk').addEventListener('pointermove',()=>{if(!drawing||currentScreen==='scr-result')resetIdle();},{passive:true});
document.getElementById('kiosk').addEventListener('keydown',resetIdle);

function commitFigureDraw(){
  const hit=FigureDrawEngine.draw(cfg.ips,stock,figureDrawPolicy().percent);
  const actual=hit.sub==null?hit.p:hit.p.subs[hit.sub],serial=nextSerial();
  const nextLog=[...logArr,{timestamp:new Date().toISOString(),ipId:hit.ip.id,ipName:hit.ip.name,grade:hit.p.grade,prizeName:hit.sub==null?actual.name:hit.p.name+' - '+actual.name,isLastOne:false,luckyGrade:'',serial,kind:hit.kind,drawMode:figureProbabilityEnabled()?'fixed-probability':'stock',figureWinPercent:activeFigurePercent(),scrollNumber:selectedScroll+1}];
  // One localStorage write commits both inventory and log, before any reveal.
  localStorage.setItem(K_STATE,JSON.stringify({stock:hit.stock,log:nextLog}));
  stock=hit.stock;logArr=nextLog;
  curIp=hit.ip;
  lastResult={ip:hit.ip,prize:hit.p,isLucky:false,serial,high:hit.kind==='figure',kind:hit.kind,wonName:actual.name,wonImageKey:actual.imageKey,media:actual.videoKey?actual:hit.p};
}
function commitScrollDraw(){
  try{commitFigureDraw();}catch(error){setScrollProgress(0);startScrollLoop();toast('추첨을 진행하지 못했습니다: '+error.message);return false;}
  drawing=true;clearTimeout(idleTimer);document.getElementById('scroll-open-btn').disabled=true;document.getElementById('open-back').disabled=true;
  document.getElementById('scr-open').classList.add('opening');return true;
}
// Automatic open (button / keyboard): play the whole clip and finish on `ended`.
function revealScroll(){
  if(currentScreen!=='scr-open')return;
  if(drawing){if(scrollPlaybackFailed)playOpeningVideo();return;}
  if(!scrollScrubbing&&!beginScrollScrub())return;
  if(!scrollHasFrame()){scrollAutoPending=true;if(!scrollVideo().seeking)primeScrollVideo();waitForScroll();return;}
  cancelScrollWait();
  if(commitScrollDraw())playOpeningVideo();
}
// Completed drag: the paper is already open on screen, so finish directly. Never call play() from the last
// frame: browsers that clamp that seek to `duration` would restart the open clip from its first frame.
function completeScrollDrag(){
  if(currentScreen!=='scr-open'||drawing||!scrollScrubbing)return;
  if(!scrollHasFrame()){startScrollLoop();return;}
  if(commitScrollDraw())finishScrollReveal();
}
// Progressive left-to-right drag; incomplete and cancelled gestures never draw.
(()=>{
  const el=document.getElementById('scroll-drag');let pointer=null,startX=0;
  el.addEventListener('pointerdown',e=>{if(drawing||pointer!==null||e.button>0)return;if(!beginScrollScrub())return;pointer=e.pointerId;startX=e.clientX;el.setPointerCapture(pointer);});
  el.addEventListener('pointermove',e=>{if(e.pointerId!==pointer||drawing)return;setScrollProgress(Math.max(0,Math.min(1,(e.clientX-startX)/Math.max(1,el.clientWidth*.65))));manageIdle();});
  el.addEventListener('pointerup',e=>{if(e.pointerId!==pointer)return;const p=Number(el.style.getPropertyValue('--progress'));pointer=null;if(p>=.98)completeScrollDrag();else{setScrollProgress(0);startScrollLoop();}});
  const cancel=()=>{pointer=null;if(!drawing){setScrollProgress(0);startScrollLoop();}};el.addEventListener('pointercancel',cancel);el.addEventListener('lostpointercapture',cancel);
  el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();revealScroll();}});
})();
renderResult = function(){
  resultLoop.hide();
  figureBase.renderResult();
  document.querySelector('#scr-result h2').textContent=lastResult.high?'경품 당첨!':'아쉽네요!';
  document.getElementById('rc-grade').textContent=lastResult.high?(lastResult.prize.grade||'당첨상'):'';
  document.getElementById('rc-grade').hidden=!lastResult.high;
  document.getElementById('scr-result').classList.toggle('participation-result',!lastResult.high);
  if(!lastResult.high)document.getElementById('rc-name').textContent='아쉽게도 당첨을 놓쳤어요!\n다음 기회를 노려보아요!';
  if(!(lastResult.wonImageKey||lastResult.prize.imageKey)&&lastResult.high){document.getElementById('rc-img').innerHTML='<span role="img" aria-label="경품 이미지 미등록">🎁</span>';}
  clearInterval(resultTick);resultTick=setInterval(updateResultCountdown,200);
  const key=reusableResultKey(lastResult);if(key)resultLoop.show(key);
}
function updateResultCountdown(){const e=document.getElementById('result-countdown');if(e)e.textContent=figurePopup?'영상 재생 중':`${Math.max(0,Math.ceil((resultDeadline-Date.now())/1000))}초 후 처음으로 돌아갑니다`;}
async function figureMediaUrl(key,epoch=figureEpoch){
  if(!key)return null;const data=await idbGet(key);if(!data||epoch!==figureEpoch)return null;if(typeof data==='string')return data;
  const blob=mediaBlob(data);if(!blob)return null;const url=URL.createObjectURL(blob);figureMediaUrls.push(url);return url;
}
async function startResultMedia(){
  const epoch=figureEpoch,result=lastResult,p=result.media||result.prize;
  const key=reusableResultKey(result);
  const url=key?null:await figureMediaUrl(p.videoKey,epoch);if(epoch!==figureEpoch||currentScreen!=='scr-result'||result!==lastResult)return;
  const el=document.getElementById('rc-img');
  if(url){el.innerHTML='';const v=document.createElement('video');v.src=url;v.muted=true;v.loop=true;v.playsInline=true;v.autoplay=true;el.appendChild(v);v.play().catch(()=>{});}
  el.onclick=p.popupVideoKey?()=>showFigurePopup(p.popupVideoKey):null;
  el.style.cursor=p.popupVideoKey?'pointer':'';el.tabIndex=p.popupVideoKey?0:-1;
  el.setAttribute('aria-label',p.popupVideoKey?'경품 영상 보기':result.wonName);
  el.onkeydown=p.popupVideoKey?e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();showFigurePopup(p.popupVideoKey);}}:null;
  document.getElementById('result-hint').textContent=p.popupVideoKey?'상품을 터치하면 영상을 볼 수 있습니다':'스태프에게 이 화면을 보여주세요';
}
async function showFigurePopup(key){
  if(figurePopup)return;
  const epoch=figureEpoch;const url=await figureMediaUrl(key);if(!url||epoch!==figureEpoch||currentScreen!=='scr-result')return;
  figurePopup=document.createElement('div');figurePopup.className='figure-media-popup';figurePopup.setAttribute('role','dialog');figurePopup.setAttribute('aria-label','경품 영상');figurePopup.setAttribute('aria-modal','true');
  const close=document.createElement('button');close.textContent='닫기';close.onclick=closeFigurePopup;
  const video=document.createElement('video');video.src=url;video.controls=true;video.playsInline=true;video.muted=cfg.muted;video.onended=closeFigurePopup;
  figurePopup.append(close,video);document.body.appendChild(figurePopup);clearTimeout(idleTimer);close.focus();
  figurePopup.onkeydown=e=>{if(e.key==='Escape')closeFigurePopup();};video.play().catch(()=>{});
}
function closeFigurePopup(){if(figurePopup){figurePopup.querySelector('video').pause();figurePopup.remove();figurePopup=null;}if(currentScreen==='scr-result'){manageIdle();document.getElementById('rc-img').focus();}}
resetToIdle = function(){
  if(drawing&&currentScreen==='scr-open')return;
  figureEpoch++;clearTimeout(openingTimer);cancelAnimationFrame(openingFrame);clearInterval(resultTick);closeFigurePopup();hideSummon();
  resultLoop.hide();
  document.querySelectorAll('#scr-result video:not(#result-loop-video)').forEach(v=>{v.pause();v.removeAttribute('src');v.load();});
  figureMediaUrls.forEach(url=>URL.revokeObjectURL(url));figureMediaUrls=[];
  selectedScroll=null;figureBase.resetToIdle();
}
renderAdmIps = function(){
  figureBase.renderAdmIps();
  document.querySelectorAll('#pane-ips .adm-card').forEach((card,ii)=>{
    card.querySelectorAll('.prize-edit-row').forEach((row,pi)=>{
      const p=cfg.ips[ii].prizes[pi],kind=p.kind||(p.tier==='high'?'figure':'participation');
      const select=row.querySelector('select');select.innerHTML=`<option value="participation" ${kind==='participation'?'selected':''}>참가상</option><option value="figure" ${kind==='figure'?'selected':''}>피규어</option>`;
      select.onchange=()=>{p.kind=select.value;p.tier=p.kind==='figure'?'high':'normal';};
      row.querySelector('.cool-in').disabled=true;row.querySelector('.cool-in').title='피규어 드로우에서는 쿨다운을 사용하지 않습니다';
      const media=document.createElement('div');media.className='figure-admin-media';
      media.innerHTML=`<button class="adm-btn sec" onclick="uploadFigureVideo(${ii},${pi},'videoKey')">${p.videoKey?'✓ ':''}상품 영상</button><button class="adm-btn sec" onclick="removeFigureVideo(${ii},${pi},'videoKey')">상품 영상 해제</button><button class="adm-btn sec" onclick="uploadFigureVideo(${ii},${pi},'popupVideoKey')">${p.popupVideoKey?'✓ ':''}클릭 팝업 영상</button><button class="adm-btn sec" onclick="removeFigureVideo(${ii},${pi},'popupVideoKey')">팝업 해제</button>`;row.after(media);
    });
  });
  const note=document.createElement('p');note.className='figure-rule-note';note.textContent='피규어 / 참가상을 지정하고 실제 수량을 입력하세요. 기본은 전체 IP의 노출 경품을 합친 잔여 재고 비례 추첨입니다. 설정 탭에서 별도 피규어 확률을 켤 수 있습니다. 시간 제한은 설정 탭에서 관리하며 상품별 쿨다운과 행운상은 적용하지 않습니다.';document.getElementById('pane-ips').prepend(note);
}
async function uploadFigureVideo(ii,pi,field){
  const p=cfg.ips[ii].prizes[pi],f=await pickFile('video/*');if(!f)return;
  if(f.size>60*1048576){toast('영상은 60MB 이하로 등록해주세요');return;}
  const buf=await fileToArrayBuffer(f);if(!buf){toast('영상 파일을 읽지 못했습니다');return;}
  const key='figure_video_'+Date.now()+'_'+field;
  if(!await idbPut(key,{buf,type:f.type||'video/mp4'})){toast('영상 저장 공간을 확인해주세요');return;}
  const old=p[field];p[field]=key;if(!saveCfg()){p[field]=old;await idbDel(key);toast('설정 저장 실패');return;}
  scheduleResultLoop();toast('영상 등록됨');renderAdmIps();
}
function removeFigureVideo(ii,pi,field){const p=cfg.ips[ii].prizes[pi],old=p[field];delete p[field];if(!saveCfg()){p[field]=old;toast('설정 저장 실패');return;}scheduleResultLoop();renderAdmIps();}
renderAdmSettings = function(){
  figureBase.renderAdmSettings();
  const root=document.getElementById('pane-settings'),card=document.createElement('div');card.className='adm-card';
  card.innerHTML=`<h4>피규어 드로우</h4><div class="adm-row"><label for="hide-scroll-selection">소환서 선택 화면 숨김</label><input id="hide-scroll-selection" type="checkbox" role="switch" ${cfg.hideScrollSelection===true?'checked':''} onchange="saveScrollSelectionVisibility()"></div><p class="figure-rule-note">켜면 메인에서 소환서를 자동 선택하여 개봉 화면으로 바로 이동합니다. 변경 즉시 저장됩니다.</p><div class="adm-row"><label for="figure-probability-enabled">피규어 당첨 확률 사용</label><input id="figure-probability-enabled" type="checkbox" role="switch" ${figureProbabilityEnabled()?'checked':''} onchange="updateFigureRuleInputs()" style="flex:none;width:24px;height:24px"></div><div class="adm-row"><label for="figure-percent">피규어 확률 (%)</label><input id="figure-percent" type="number" min="0" max="100" step="any" value="${figurePercent()}" ${figureProbabilityEnabled()?'':'disabled'}></div><p id="figure-mode-note" class="figure-rule-note" aria-live="polite"></p><p class="figure-rule-note">소환서 번호는 확률에 영향을 주지 않습니다. 결과는 무입력 5초 후 복귀합니다. 변경 후 저장 버튼을 눌러 적용하세요.</p><button class="adm-btn pri" onclick="saveFigureRules()">추첨 방식 저장</button>`;root.prepend(card);updateFigureRuleInputs();
  const visibility=document.createElement('div');visibility.className='adm-card selection-visibility-card';
  visibility.innerHTML='<h4>현장 운영 · 시퀀스 간소화</h4>';
  const visibilityRow=document.getElementById('hide-scroll-selection').closest('.adm-row');
  const visibilityNote=visibilityRow.nextElementSibling;visibility.append(visibilityRow,visibilityNote);root.prepend(visibility);
  ['set-drawidle'].forEach(id=>{const el=document.getElementById(id);el.disabled=true;el.title='피규어 드로우에서는 사용하지 않는 기존 쿠지 설정';});
  root.querySelector('button[onclick="toggleLineup()"]').disabled=true;
  const timing=document.createElement('div');timing.className='adm-card';
  timing.innerHTML=`<h4>피규어 당첨 시간 제한</h4><label><input id="figure-cool-on" type="checkbox" ${cfg.figureCooldownEnabled===true?'checked':''}> 당첨 후 쿨다운 사용</label><p>시간(분)은 기본 설정의 쿨다운(분)에서 지정합니다. 모든 피규어에 공통 적용합니다.</p><label><input id="figure-interval-on" type="checkbox" ${cfg.figureIntervalEnabled===true?'checked':''}> 구간당 1개 배정</label><div class="adm-row"><label>구간 길이(분)</label><input id="figure-interval-min" type="number" min="1" value="${Number(cfg.figureIntervalMin)||24}"></div><div class="adm-row"><label>운영 시작 시각</label><input id="figure-interval-start" type="datetime-local"></div><p>시작 시각부터 설정한 길이로 구간을 계속 나눕니다. 구간 수 제한 없이 남은 피규어 재고를 사용합니다. 각 구간의 무작위 시각 이후 첫 참여자에게 피규어를 지급합니다. 이 모드에서는 확률과 쿨다운 대신 구간 배정을 적용합니다. 참여자나 재고가 없으면 지급할 수 없으며 미지급분은 이월하지 않습니다. 당일 배포할 재고만 입력하세요. 재고 소진 후에는 참가상만 진행합니다. 둘째 날에는 시작 날짜/시각을 다시 설정하세요.</p><button class="adm-btn pri" onclick="saveFigureTiming()">시간 제한 저장</button>`;
  root.prepend(timing);
  const date=new Date(cfg.figureIntervalStart||Date.now());if(Number.isFinite(date.getTime()))document.getElementById('figure-interval-start').value=new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
  document.getElementById('set-cool').closest('.adm-row').nextElementSibling.textContent='피규어 전체 당첨 후 재당첨 제한 시간입니다. 위 시간 제한 카드에서 ON/OFF를 설정하세요. 0분이면 제한하지 않습니다.';

  // BGM playback mode lives inside the existing BGM card.
  const bgmHead=[...root.querySelectorAll('.adm-card h4')].find(h=>h.textContent.startsWith('배경음악'));
  if(bgmHead){const box=document.createElement('div');box.className='figure-bgm-mode';
    box.innerHTML=`<div class="adm-row"><label for="bgm-mode">재생 방식</label><select id="bgm-mode" onchange="saveBgmMode()"><option value="screen" ${bgmSingle()?'':'selected'}>화면별 전환</option><option value="single" ${bgmSingle()?'selected':''}>한 곡 연속 루핑</option></select></div><div class="adm-row"><label for="bgm-single-slot">연속 재생 곡</label><select id="bgm-single-slot" onchange="saveBgmMode()" ${bgmSingle()?'':'disabled'}>${BGM_SLOTS.map(s=>`<option value="${s}" ${bgmSingleSlot()===s?'selected':''}>${{idle:'대기',select:'선택',play:'뽑기'}[s]} 슬롯</option>`).join('')}</select></div><p class="figure-rule-note">한 곡 연속 루핑이면 화면이 바뀌어도 선택한 슬롯의 곡이 끊기지 않고 이어집니다. 소환서 화면과 개봉 연출 중 BGM 볼륨 자동 감소(25%)와 음소거는 그대로 적용됩니다. 선택한 슬롯에 업로드된 곡이 없으면 무음입니다.</p>`;
    bgmHead.parentElement.appendChild(box);}
  const note=document.createElement('p');note.className='figure-rule-note';note.textContent='소환서 선택 → 드래그 개봉 → 결과 흐름을 사용합니다. 기존 라인업·NPC 설정은 이 흐름에 적용하지 않습니다. 피규어 전체 쿨다운과 구간 제한은 위 시간 제한 카드에서 설정합니다. 대기 영상과 BGM·효과음은 그대로 사용할 수 있습니다.';card.appendChild(note);
}
function saveScrollSelectionVisibility(){
  const old=cfg.hideScrollSelection;cfg.hideScrollSelection=document.getElementById('hide-scroll-selection').checked;
  if(!saveCfg()){cfg.hideScrollSelection=old;renderAdmSettings();toast('설정 저장 실패');return;}
  toast('소환서 선택 화면 설정 저장됨');
}
function saveBgmMode(){
  const mode=document.getElementById('bgm-mode').value,slot=document.getElementById('bgm-single-slot').value;
  const old={mode:cfg.bgmMode,slot:cfg.bgmSingleSlot};
  cfg.bgmMode=mode==='single'?'single':'screen';if(BGM_SLOTS.includes(slot))cfg.bgmSingleSlot=slot;
  if(!saveCfg()){cfg.bgmMode=old.mode;cfg.bgmSingleSlot=old.slot;toast('설정 저장 실패');renderAdmSettings();return;}
  document.getElementById('bgm-single-slot').disabled=!bgmSingle();
  if(curBgm)figureBase.startBgm(bgmSingle()?bgmSingleSlot():curBgm); // apply immediately (admin is reached from the idle screen)
  toast(bgmSingle()?'한 곡 연속 루핑으로 저장됨':'화면별 전환으로 저장됨');
}
function updateFigureRuleInputs(){
  const enabled=document.getElementById('figure-probability-enabled').checked;
  document.getElementById('figure-percent').disabled=!enabled;
  document.getElementById('figure-mode-note').textContent=enabled?'ON · 설정 확률로 피규어 당첨 여부를 결정한 뒤, 같은 종류 안에서 잔여 수량에 비례해 선택합니다. 피규어 소진 시 참가상만 지급하며, 참가상 소진 시 중지합니다(피규어 확률 100% 제외).':'OFF · 재고 비례 추첨: 남은 피규어와 참가상을 합쳐 수량에 비례해 선택합니다. 한 종류가 소진돼도 나머지 경품으로 계속 진행하며, 모든 노출 경품이 소진되면 종료합니다.';
}
function saveFigureRules(){
  const enabled=document.getElementById('figure-probability-enabled').checked;
  const raw=document.getElementById('figure-percent').value,value=Number(raw);
  if(enabled&&(raw.trim()===''||!Number.isFinite(value)||value<0||value>100)){toast('0~100 사이의 확률을 입력해주세요');return;}
  const old={enabled:cfg.figureProbabilityEnabled,percent:cfg.figureWinPercent};
  cfg.figureProbabilityEnabled=enabled;if(enabled)cfg.figureWinPercent=value;
  if(!saveCfg()){cfg.figureProbabilityEnabled=old.enabled;cfg.figureWinPercent=old.percent;toast('설정 저장 실패');return;}
  refreshIdleSoldout();toast(enabled?'설정 확률 추첨으로 저장됨':'재고 비례 추첨으로 저장됨');
}
// The IndexedDB initialization in index.html owns the single initial boot.
document.getElementById('idle-sub').textContent='';
// Covers either ordering: IndexedDB boot finishing before or after this script.
scheduleResultLoop();

// Position overlays from the actual contained video's geometry; never change playback.
function syncIdleTitleLayout(){
  const screen=document.getElementById('scr-idle'),v=document.getElementById('idle-video');
  const w=screen.clientWidth,h=screen.clientHeight;if(!w||!h)return;
  const known=v.classList.contains('is-current')&&v.videoWidth>0&&v.videoHeight>0;
  const ratio=known?v.videoWidth/v.videoHeight:16/9;
  const landscape=ratio>1;screen.dataset.videoOrientation=landscape?'landscape':'portrait';
  const brand=screen.querySelector('.idle-brand'),button=document.getElementById('idle-banner');
  const brandHeight=brand.getBoundingClientRect().height,buttonHeight=button.getBoundingClientRect().height;
  const videoHeight=Math.min(h,w/ratio),gap=(h-videoHeight)/2;
  // Only use letterbox margins when both groups fit; otherwise overlay upper/lower portions.
  const margins=landscape&&gap>=brandHeight+48&&gap>=buttonHeight+64;
  let titleY=margins?Math.min(gap-brandHeight/2-12,gap/2+24):Math.max(brandHeight/2+24,h*(landscape?.19:1/3)+24);
  let buttonY=margins?h-gap/2:h*(landscape?.82:.74);
  if(!landscape){
    const spacing=Math.min(72,Math.max(28,h*.045));
    const groupHeight=brandHeight+spacing+buttonHeight;
    const groupTop=Math.max(24,(h-groupHeight)/2);
    titleY=groupTop+brandHeight/2;
    buttonY=groupTop+brandHeight+spacing+buttonHeight/2;
  }
  screen.style.setProperty('--idle-title-y',Math.min(h-buttonHeight-100,titleY)+'px');
  screen.style.setProperty('--idle-touch-y',Math.min(h-buttonHeight/2-60,buttonY)+'px');
}
for(const video of document.querySelectorAll('.idle-media-slot'))for(const event of ['loadedmetadata','resize','emptied'])video.addEventListener(event,syncIdleTitleLayout);
document.addEventListener('idle-video-change',syncIdleTitleLayout);
window.addEventListener('resize',syncIdleTitleLayout);
if(document.fonts)document.fonts.ready.then(syncIdleTitleLayout);
requestAnimationFrame(syncIdleTitleLayout);

function saveFigureTiming(){
 const enabled=document.getElementById('figure-interval-on').checked,minutes=Number(document.getElementById('figure-interval-min').value),start=new Date(document.getElementById('figure-interval-start').value);
 const cooldown=Number(document.getElementById('set-cool').value);
 if(!Number.isFinite(cooldown)||cooldown<0||!Number.isInteger(minutes)||minutes<1||(enabled&&!Number.isFinite(start.getTime()))){toast('시간과 운영 시작 시각을 확인해주세요');return;}
 const old={...cfg};Object.assign(cfg,{figureCooldownEnabled:document.getElementById('figure-cool-on').checked,cooldownMin:cooldown,figureIntervalEnabled:enabled,figureIntervalMin:minutes,figureIntervalStart:Number.isFinite(start.getTime())?start.toISOString():''});
 if(enabled&&(old.figureIntervalStart!==cfg.figureIntervalStart||old.figureIntervalMin!==minutes||!cfg.figureIntervalSeed))cfg.figureIntervalSeed=Array.from(crypto.getRandomValues(new Uint32Array(4))).join('-');
 if(!saveCfg()){for(const key of ['figureIntervalSeed','figureCooldownEnabled','cooldownMin','figureIntervalEnabled','figureIntervalMin','figureIntervalStart']){if(Object.hasOwn(old,key))cfg[key]=old[key];else delete cfg[key];}toast('설정 저장 실패');return;}refreshIdleSoldout();toast('시간 제한 저장됨');
}
