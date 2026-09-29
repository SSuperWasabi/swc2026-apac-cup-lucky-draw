// Real Chrome check of 여러 곡 연속 재생 (BGM playlist): order, wrap-around, no restart across screens,
// ducking, mute, admin add/move/remove. Tracks are short synthetic tones stored like admin uploads.
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
  res.end(data);
 });
});
// 16-bit mono PCM WAV with a sine tone.
function wav(freq,seconds,rate=8000){
 const n=Math.round(seconds*rate),b=Buffer.alloc(44+n*2);
 b.write('RIFF',0);b.writeUInt32LE(36+n*2,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);
 b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n*2,40);
 for(let i=0;i<n;i++)b.writeInt16LE(Math.round(Math.sin(2*Math.PI*freq*i/rate)*12000),44+i*2);
 return b.toString('base64');
}
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 try{
  const page=await browser.newPage({viewport:{width:1024,height:1366},serviceWorkers:'block'});
  await page.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{if(typeof cfg!=='undefined')cfg.screenTransitions=false;}));
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const base=`http://127.0.0.1:${server.address().port}/`;
  await page.goto(base,{waitUntil:'load'});await page.waitForFunction(()=>typeof idb!=='undefined'&&idb);

  // Three tracks saved the way the admin stores uploads; mode saved and the page reloaded (boot must load them).
  await page.evaluate(async tracks=>{
   for(const [id,b64] of tracks){const bin=atob(b64),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);await idbPut('bgm_list_'+id,{buf:u.buffer,type:'audio/wav'});}
   cfg.bgmPlaylist=tracks.map(([id])=>({id,name:id+'.wav'}));cfg.bgmMode='playlist';cfg.muted=false;saveCfg();
  },[['t1',wav(440,1.2)],['t2',wav(660,1.2)],['t3',wav(880,1.2)]]);
  await page.reload({waitUntil:'load'});await page.waitForFunction(()=>typeof idb!=='undefined'&&idb&&bgmList.urls.size===3,null,{timeout:8000});
  await page.evaluate(()=>{window.__order=[];const a=bgmEl.list;a.addEventListener('playing',()=>{const id=[...bgmList.urls].find(([,u])=>u===a.src);window.__order.push(id&&id[0]);});});

  // 1) Plays in list order and wraps: t1 -> t2 -> t3 -> t1.
  await page.evaluate(()=>startBgm('idle'));
  await page.waitForFunction(()=>window.__order.length>=4,null,{timeout:10000});
  const order=await page.evaluate(()=>window.__order.slice(0,4));
  assert.deepEqual(order,['t1','t2','t3','t1'],'playlist order with wrap-around');
  assert.deepEqual(await page.evaluate(()=>({cur:curBgm,others:['idle','select','play'].every(k=>bgmEl[k].paused)})),{cur:'list',others:true});
  console.log('PASS: 여러 곡 연속 재생 plays %s in order and wraps to the first track',order.join(' -> '));

  // 2) Screen changes keep the same track and position; ducking and mute still apply.
  await page.evaluate(()=>{stock={ip1:[1,0]};refreshIdleSoldout();});
  const before=await page.evaluate(()=>({src:bgmEl.list.src,t:bgmEl.list.currentTime}));
  await page.locator('#idle-banner').click();
  await page.waitForFunction(()=>document.getElementById('choose-stage').classList.contains('is-interactive'),null,{timeout:5000});
  const after=await page.evaluate(()=>({src:bgmEl.list.src,t:bgmEl.list.currentTime,playing:!bgmEl.list.paused,cur:curBgm}));
  assert.equal(after.cur,'list');assert.equal(after.playing,true);
  assert.ok(after.src!==before.src||after.t>before.t,'no restart on the screen change');
  await page.evaluate(()=>{setBgmDucked(true);});
  // The gain change is scheduled on the audio thread: wait for it to land.
  await page.waitForFunction(()=>Math.abs(bgmGains.get(bgmEl.list).gain.value-.1)<.001,null,{timeout:2000}).catch(async()=>assert.fail('ducked to 25%: gain '+await page.evaluate(()=>bgmGains.get(bgmEl.list).gain.value)));
  await page.evaluate(()=>{setBgmDucked(false);cfg.muted=true;applyMute();});
  assert.equal(await page.evaluate(()=>bgmEl.list.paused),true,'mute pauses the playlist');
  await page.evaluate(()=>{cfg.muted=false;applyMute();});
  await page.waitForFunction(()=>!bgmEl.list.paused,null,{timeout:3000});
  console.log('PASS: screen change keeps playing without restart; ducking 25% and mute apply');

  // 3) Admin: mode option, rows, move, remove (the playing track is replaced by the next one).
  await page.evaluate(()=>{resetToIdle();renderAdmSettings();});
  const admin=await page.evaluate(()=>({mode:document.getElementById('bgm-mode').value,rows:[...document.querySelectorAll('[onclick^="removeBgmTrack"]')].length,add:!!document.getElementById('bgm-track-add')}));
  assert.deepEqual(admin,{mode:'playlist',rows:3,add:true});
  await page.evaluate(()=>moveBgmTrack(2,-1));
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('swc2026-apac-lucky-draw.config.v1')).bgmPlaylist.map(t=>t.id)),['t1','t3','t2']);
  const playing=await page.evaluate(()=>bgmList.current);
  await page.evaluate(id=>removeBgmTrack(id),playing);
  await page.waitForFunction(id=>!bgmList.urls.has(id)&&bgmList.current!==id,playing,{timeout:3000});
  assert.equal(await page.evaluate(id=>idbGet('bgm_list_'+id).then(d=>!!d),playing),false,'track data removed');
  assert.equal(await page.evaluate(()=>[...document.querySelectorAll('[onclick^="removeBgmTrack"]')].length),2);
  await page.waitForFunction(()=>!bgmEl.list.paused,null,{timeout:3000});
  console.log('PASS: admin shows the playlist; ▲▼ reorders and saves; 삭제 removes the playing track and moves on');

  // 4) Other modes are unchanged: 화면별 전환 stops the playlist and plays the screen slot.
  await page.evaluate(()=>{document.getElementById('bgm-mode').value='screen';saveBgmMode();});
  assert.deepEqual(await page.evaluate(()=>({cur:curBgm,listPaused:bgmEl.list.paused,mode:cfg.bgmMode})),{cur:'idle',listPaused:true,mode:'screen'});
  console.log('PASS: switching back to 화면별 전환 stops the playlist');
  assert.deepEqual(errors,[]);
 } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
