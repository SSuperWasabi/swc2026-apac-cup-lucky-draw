// Operator double-check with the real BGM files (not part of the regular suite; the tracks are local, gitignored).
// Registers every mp3 in a folder through the admin + 곡 추가 file picker, restarts the app, then checks each
// track plays in order with real signal while the kiosk flow moves idle -> choose -> open -> result, and wraps.
// Usage: node scripts/check-bgm-playlist-real.cjs [folder]   (default resource/audio/final-assets/BGM)
const ROOT=require('node:path').resolve(__dirname,'..');
const {chromium}=require(ROOT+'/.tools/node_modules/playwright-core');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const app=path.join(ROOT,'app'),bgmDir=path.resolve(process.argv[2]||path.join(ROOT,'resource/audio/final-assets/BGM'));
const tracks=fs.readdirSync(bgmDir).filter(f=>/\.mp3$/i.test(f)).sort();
const server=http.createServer((req,res)=>{
 const p=decodeURIComponent(new URL(req.url,'http://x').pathname);const file=path.resolve(app,'.'+(p==='/'?'/index.html':p));
 fs.readFile(file,(e,d)=>{if(e){res.writeHead(404).end();return;}
  const t={'.html':'text/html','.js':'text/javascript','.css':'text/css','.mp4':'video/mp4','.wav':'audio/wav','.png':'image/png','.webp':'image/webp','.ttf':'font/ttf','.svg':'image/svg+xml','.jpg':'image/jpeg'};
  res.setHeader('Content-Type',t[path.extname(file)]||'application/octet-stream');res.end(d);});
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 const t0=Date.now(),log=(...a)=>console.log(((Date.now()-t0)/1000).toFixed(1).padStart(6)+'s',...a);
 try{
  const page=await browser.newPage({viewport:{width:1024,height:1366},serviceWorkers:'block'});
  await page.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{if(typeof cfg!=='undefined')cfg.screenTransitions=false;}));
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='warning'||m.type()==='error')errors.push('console: '+m.text());});
  const base='http://127.0.0.1:'+server.address().port+'/';
  await page.goto(base,{waitUntil:'load'});await page.waitForFunction(()=>typeof idb!=='undefined'&&idb);

  // 1) Register every track through the real admin button + file chooser, then pick the mode in the admin select.
  await page.evaluate(()=>{renderAdmSettings();});
  for(const f of tracks){
   const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.evaluate(()=>{addBgmTrack();})]);
   await chooser.setFiles(path.join(bgmDir,f));
   await page.waitForFunction(n=>bgmTracks().length===n&&bgmList.urls.size===n,tracks.indexOf(f)+1,{timeout:15000});
  }
  await page.evaluate(()=>{renderAdmSettings();document.getElementById('bgm-mode').value='playlist';saveBgmMode();});
  const listed=await page.evaluate(()=>[...document.querySelectorAll('.figure-bgm-mode .adm-row span')].map(s=>s.textContent));
  assert.deepEqual(listed,tracks,'admin list shows every uploaded track in upload order');
  log('registered '+tracks.length+' tracks via admin');

  // 2) Restart the app (as the kiosk would) — everything must come back from IndexedDB.
  await page.reload({waitUntil:'load'});
  await page.waitForFunction(n=>typeof idb!=='undefined'&&idb&&bgmList.urls.size===n,tracks.length,{timeout:20000,polling:200});
  assert.equal(await page.evaluate(()=>cfg.bgmMode),'playlist');
  await page.evaluate(()=>{
   stock={ip1:[3,50]};refreshIdleSoldout();cfg.muted=false;cfg.resultReturnSec=3;
   window.__played=[];const a=bgmEl.list;
   a.addEventListener('playing',()=>{const name=(bgmTracks().find(t=>bgmList.urls.get(t.id)===a.src)||{}).name;if(window.__played.at(-1)!==name)window.__played.push(name);});
   startBgm('idle');
  });
  await page.waitForFunction(()=>bgmGains.get(bgmEl.list)&&!bgmEl.list.paused,null,{timeout:8000});
  // Real signal check: tap the BGM gain node with an analyser.
  await page.evaluate(()=>{const c=audioCtx(),an=c.createAnalyser();an.fftSize=2048;bgmGains.get(bgmEl.list).connect(an);window.__rms=()=>{const d=new Float32Array(an.fftSize);an.getFloatTimeDomainData(d);return Math.sqrt(d.reduce((s,x)=>s+x*x,0)/d.length);};});
  const audible=async()=>{let best=0;for(let i=0;i<10;i++){best=Math.max(best,await page.evaluate(()=>window.__rms()));await page.waitForTimeout(100);}return best;};

  // 3) Walk every track: audible and advancing, then (jumped near its end) hands over to the next one.
  //    Track 2 plays into the choose screen, track 3 into the open screen (ducked), track 4 into the result.
  const screens={1:'choose',2:'open',3:'result'};
  for(let i=0;i<tracks.length;i++){
   await page.waitForFunction(n=>window.__played.length>n,i,{timeout:15000});
   const name=await page.evaluate(()=>window.__played.at(-1));
   assert.equal(name,tracks[i],'track '+(i+1)+' in order');
   const t1=await page.evaluate(()=>bgmEl.list.currentTime);await page.waitForTimeout(700);
   const st=await page.evaluate(()=>({t:bgmEl.list.currentTime,d:bgmEl.list.duration,paused:bgmEl.list.paused,screen:currentScreen,gain:bgmGains.get(bgmEl.list).gain.value}));
   const rms=await audible();
   assert.ok(!st.paused&&st.t>t1,'track '+(i+1)+' advancing');assert.ok(rms>0.003,'track '+(i+1)+' audible (rms '+rms+')');
   log(('#'+(i+1)).padEnd(3),name.padEnd(44),'len '+st.d.toFixed(1)+'s','screen '+st.screen.padEnd(11),'gain '+st.gain.toFixed(2),'rms '+rms.toFixed(3));
   if(screens[i]==='choose'){await page.locator('#idle-banner').click();await page.waitForFunction(()=>document.getElementById('choose-stage').classList.contains('is-interactive'),null,{timeout:5000});}
   if(screens[i]==='open'){await page.locator('#scroll-grid .scroll-choice').first().click();await page.locator('#scroll-next').click();await page.waitForFunction(()=>currentScreen==='scr-open',null,{timeout:5000});}
   if(screens[i]==='result'){await page.locator('#scroll-drag').focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>currentScreen==='scr-result',null,{timeout:20000});}
   if(i===4)await page.waitForFunction(()=>currentScreen==='scr-idle',null,{timeout:15000});
   await page.evaluate(()=>{bgmEl.list.currentTime=Math.max(0,bgmEl.list.duration-1.5);});
  }
  // 4) Wrap-around back to track 1.
  await page.waitForFunction(n=>window.__played.length>n,tracks.length,{timeout:15000});
  assert.equal(await page.evaluate(()=>window.__played.at(-1)),tracks[0],'wraps to the first track');
  log('#1 again:',tracks[0]);
  assert.deepEqual(errors.filter(e=>!/favicon|status of 404/.test(e)),[],'no page errors or BGM warnings');
  console.log('RESULT: all '+tracks.length+' registered tracks played in order, audible, across idle/choose/open/result, then wrapped to #1');
 } finally{await browser.close();server.close();}
})().catch(e=>{console.error('FAIL:',e.message);process.exitCode=1;});
