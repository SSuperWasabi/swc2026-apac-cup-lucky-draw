// 볼륨 실측(실제 Chrome): 관리자 설정 탭의 볼륨 슬라이더를 마우스로 끌고, 스피커로 나가는 소리 크기(RMS)가 따라 바뀌는지 확인한다.
// 모든 오디오 출력 연결을 분석기로 가로채 잰다. 대상: BGM 전체, 연속 재생 곡별, 효과음 전체, 뽑기음, 연출 소리.
const {chromium}=require('../.tools/node_modules/playwright-core');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve('app');
const server=http.createServer((req,res)=>{const p=decodeURIComponent(new URL(req.url,'http://x').pathname);const f=path.resolve(root,'.'+(p==='/'?'/index.html':p));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(f,(e,d)=>{if(e){res.writeHead(404).end();return;}res.setHeader('Content-Type',{'.html':'text/html','.js':'text/javascript','.css':'text/css','.wav':'audio/wav','.mp4':'video/mp4','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'}[path.extname(f)]||'application/octet-stream');res.end(d);});});
function wav(freq,s,rate=22050){const n=Math.round(s*rate),b=Buffer.alloc(44+n*2);b.write('RIFF',0);b.writeUInt32LE(36+n*2,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n*2,40);for(let i=0;i<n;i++)b.writeInt16LE(Math.round(Math.sin(2*Math.PI*freq*i/rate)*16000),44+i*2);return b.toString('base64');}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 try{
  const page=await browser.newPage({viewport:{width:1024,height:1366},serviceWorkers:'block'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{const o=AudioNode.prototype.connect;window.__m=new Map();AudioNode.prototype.connect=function(d,...r){if(d instanceof AudioDestinationNode){let m=window.__m.get(d.context);if(!m){m=d.context.createAnalyser();m.fftSize=2048;o.call(m,d.context.destination);window.__m.set(d.context,m);}o.call(this,m);return d;}return o.call(this,d,...r);};
   window.__rms=()=>{let b=0;for(const m of window.__m.values()){const a=new Float32Array(m.fftSize);m.getFloatTimeDomainData(a);let s=0;for(const x of a)s+=x*x;b=Math.max(b,Math.sqrt(s/a.length));}return b;};
   document.addEventListener('DOMContentLoaded',()=>{if(typeof cfg!=='undefined')cfg.screenTransitions=false;});});
  const base=`http://127.0.0.1:${server.address().port}/`;
  await page.goto(base,{waitUntil:'load'});await page.waitForFunction(()=>typeof idb!=='undefined'&&idb);
  await page.evaluate(async([bgm,pick])=>{const u8=b=>{const s=atob(b),u=new Uint8Array(s.length);for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return u.buffer;};
   await idbPut('bgm_list_t1',{buf:u8(bgm),type:'audio/wav'});await idbPut('sfx_pick',{buf:u8(pick),type:'audio/wav',name:'pick.wav'});
   cfg.bgmPlaylist=[{id:'t1',name:"Who's Next_.mp3"}];cfg.bgmMode='playlist';cfg.muted=false;cfg.soundVolumes={};saveCfg();},[wav(330,60),wav(550,.8)]);
  await page.reload({waitUntil:'load'});await page.waitForFunction(()=>typeof idb!=='undefined'&&idb&&bgmList.urls.size===1&&!!sfxBuf.pick&&ScrollSound.has('open'),null,{timeout:10000});
  await page.evaluate(()=>{unlockAudio();startBgm('idle');openAdmin();pinBuf=String(cfg.adminPin);checkPin();admTab('settings');});
  await page.waitForFunction(()=>!bgmEl.list.paused&&bgmEl.list.currentTime>.3,null,{timeout:8000});
  const peak=async(ms=600)=>{let p=0;const end=Date.now()+ms;while(Date.now()<end){p=Math.max(p,await page.evaluate(()=>window.__rms()));await page.waitForTimeout(30);}return p;};
  // 슬라이더를 원하는 값 위치로 마우스로 끈다(손가락 조작과 같은 input/change 이벤트).
  const drag=async(key,value)=>{const input=page.locator(`.vol-row[data-key="${key}"] input`);await input.scrollIntoViewIfNeeded();const b=await input.boundingBox();const x=b.x+b.width*value/150;
   await page.mouse.move(b.x+b.width*2/3,b.y+b.height/2);await page.mouse.down();await page.mouse.move(x,b.y+b.height/2,{steps:6});await page.mouse.up();await page.waitForTimeout(250);
   return page.evaluate(k=>(cfg.soundVolumes||{})[k],key);};
  const ratio=(a,b)=>+(a/b).toFixed(2);

  // 1) 연속 재생 곡별 볼륨 줄이 보이고, 곡별·전체 볼륨이 실제 출력에 적용된다.
  const rows=await page.evaluate(()=>[...document.querySelectorAll('.vol-row')].map(r=>r.dataset.key));
  assert.deepEqual(rows,['bgm_all','bgm_idle','bgm_select','bgm_play','bgm_list_t1','sfx_all','sfx_pick','sfx_win','sfx_special','sfx_participation','sfx_scene'],'볼륨 줄: BGM 전체·곡별·효과음 전체·연출 소리');
  const full=await peak();
  const v1=await drag('bgm_list_t1',50);const half=await peak();
  const v2=await drag('bgm_all',0);const mute=await peak();
  await drag('bgm_all',150);const loud=await peak();
  assert.ok(Math.abs(ratio(half,full)-v1/100)<.08,`곡별 볼륨 ${v1}% -> 출력 ${ratio(half,full)}배`);
  assert.equal(v2,0);assert.ok(mute<.002,'BGM 전체 0%면 무음');
  assert.ok(Math.abs(ratio(loud,full)-1.5*v1/100)<.1,`BGM 전체 150% × 곡 ${v1}% -> 출력 ${ratio(loud,full)}배`);
  console.log('PASS: BGM 연속 재생: 곡별 볼륨 줄 표시, 곡 %s% -> 출력 %s배, 전체 0% -> 무음, 전체 150% -> %s배 (관리자 슬라이더 조작)',v1,ratio(half,full),ratio(loud,full));
  await page.evaluate(()=>{bgmEl.list.pause();});await page.waitForTimeout(300);

  // 2) 효과음: 뽑기음 볼륨과 효과음 전체 볼륨.
  const sfx=async()=>{const p=peak(700);await page.evaluate(()=>playSfx('pick'));return p;};
  const s100=await sfx();const sp=await drag('sfx_pick',50);const s50=await sfx();const sa=await drag('sfx_all',0);const s0=await sfx();
  assert.ok(Math.abs(ratio(s50,s100)-sp/100)<.08,`뽑기음 ${sp}% -> ${ratio(s50,s100)}배`);assert.equal(sa,0);assert.ok(s0<.002,'효과음 전체 0%면 무음');
  console.log('PASS: 효과음: 뽑기음 %s% -> 출력 %s배, 효과음 전체 0% -> 무음',sp,ratio(s50,s100));

  // 3) 연출 소리(소환서 개봉 소리 등 Web Audio 재생 소리): 연출 소리 볼륨 × 효과음 전체.
  await drag('sfx_all',100);
  const scene=async()=>{const p=peak(500);await page.evaluate(()=>ScrollSound.cue('open',.5,false));const r=await p;await page.evaluate(()=>ScrollSound.stop());return r;};
  const c100=await scene();const cv=await drag('sfx_scene',30);const c30=await scene();
  assert.ok(Math.abs(ratio(c30,c100)-cv/100)<.08,`연출 소리 ${cv}% -> ${ratio(c30,c100)}배`);
  await drag('sfx_all',0);const c0=await scene();assert.ok(c0<.002,'효과음 전체 0%면 연출 소리도 무음');
  console.log('PASS: 연출 소리: %s% -> 출력 %s배, 효과음 전체 0% -> 무음',cv,ratio(c30,c100));

  // 4) 새로 고침 후에도 저장된 볼륨이 그대로 적용된다.
  await page.reload({waitUntil:'load'});await page.waitForFunction(()=>typeof idb!=='undefined'&&idb&&ScrollSound.has('open'),null,{timeout:10000});
  const kept=await page.evaluate(()=>cfg.soundVolumes);
  assert.equal(kept.bgm_all,150);assert.equal(kept.sfx_all,0);assert.equal(kept.sfx_scene,cv);
  assert.deepEqual(errors,[]);
  console.log('PASS: 볼륨 설정이 새로 고침 후에도 유지됨');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
