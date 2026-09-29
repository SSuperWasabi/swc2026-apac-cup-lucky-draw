// Real Chrome check: while the idle screen stays up, idle clips hand over at their end in shuffle-bag
// order (every clip once per round, no clip twice in a row), using the prepared next slot. One clip loops.
const {chromium}=require('../.tools/node_modules/playwright-core');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const root=path.resolve('app'),fixtures=path.resolve('.tools/fixtures');
const ff=path.resolve('.tools/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe');
// Three distinct 2 s clips (solid colours with a counter) so the test can tell them apart.
const COLORS=['red','green','blue'];
fs.mkdirSync(fixtures,{recursive:true});
for(const c of COLORS){
 const out=path.join(fixtures,`idle-${c}.mp4`);
 if(!fs.existsSync(out))spawnSync(ff,['-nostdin','-hide_banner','-loglevel','error','-y','-f','lavfi','-i',`color=c=${c}:size=540x720:rate=30:duration=2`,'-c:v','libx264','-pix_fmt','yuv420p','-g','30','-movflags','+faststart',out]);
}
const server=http.createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 const file=pathname.startsWith('/__fx/')?path.join(fixtures,path.basename(pathname)):path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 fs.readFile(file,(error,data)=>{
  if(error){res.writeHead(404).end();return;}
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.mp4':'video/mp4','.wav':'audio/wav','.jpg':'image/jpeg','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.ttf':'font/ttf'};
  res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(data);
 });
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1024,height:1366},serviceWorkers:'block'});
  await page.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{if(typeof cfg!=='undefined')cfg.screenTransitions=false;}));
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'load'});
  await page.waitForFunction(()=>typeof idleDeck!=='undefined'&&typeof idb!=='undefined'&&!!idb);
  await page.evaluate(async colors=>{
   for(const c of colors){const buf=await(await fetch(`/__fx/idle-${c}.mp4`)).arrayBuffer();await idbPut('idlevid_'+c,{buf,type:'video/mp4'});}
   stock={ip1:[0,100]};cfg.muted=true;cfg.idleVideos=colors.map(id=>({id}));
   window.__plays=[];
   // Log each clip that becomes the visible one, with where the previous clip was when it handed over.
   document.addEventListener('idle-video-change',()=>{const a=idleDeck.active;if(a&&window.__plays.at(-1)?.id!==a.id)window.__plays.push({id:a.id,warm:a.state==='ready',loop:a.video.loop});});
   await bootIdle();refreshIdleSoldout();
  },COLORS);

  // 1) Staying on the idle screen: 7 clips play back to back — two full shuffled rounds plus one.
  await page.waitForFunction(()=>window.__plays.length>=7,null,{timeout:40000});
  const plays=await page.evaluate(()=>window.__plays.slice(0,7));
  const ids=plays.map(p=>p.id);
  assert.equal(new Set(ids.slice(0,3)).size,3,`round 1 plays every clip once: ${ids}`);
  assert.equal(new Set(ids.slice(3,6)).size,3,`round 2 plays every clip once: ${ids}`);
  for(let i=1;i<ids.length;i++)assert.notEqual(ids[i],ids[i-1],`no clip twice in a row: ${ids}`);
  assert.ok(plays.slice(1).every(p=>p.warm),'each hand-over uses the prepared next slot');
  assert.ok(plays.every(p=>p.loop===false),'clips do not loop while there is a next one');
  const diag=await page.evaluate(()=>idleVideoDiagnostics.filter(d=>d.event==='ended').length);
  assert.ok(diag>=6,`hand-overs happen at the clip end (${diag} ended events)`);
  console.log('PASS: idle stays up -> clips hand over at their end: %s (2 shuffled rounds, no repeats in a row, warm swaps)',ids.join(' > '));

  // 2) Leaving the idle screen stops the rotation; coming back continues with the next clip in the bag.
  await page.locator('#idle-banner').click();
  const count=await page.evaluate(()=>window.__plays.length);
  await page.waitForTimeout(2600);
  assert.equal(await page.evaluate(()=>window.__plays.length),count,'no rotation behind other screens');
  await page.locator('#scr-scrolls .back').click();
  await page.waitForFunction(n=>window.__plays.length>n&&currentScreen==='scr-idle',count,{timeout:5000});
  console.log('PASS: rotation pauses off the idle screen and resumes with the next clip on return');

  // 3) A single clip keeps looping (nothing to switch to).
  await page.evaluate(async()=>{cfg.idleVideos=[{id:'red'}];window.__plays=[];await playIdleVideo();});
  await page.waitForFunction(()=>idleDeck.active?.id==='red'&&!idleDeck.active.video.paused,null,{timeout:8000});
  assert.equal(await page.evaluate(()=>idleDeck.active.video.loop),true);
  await page.waitForTimeout(2600);
  assert.deepEqual(await page.evaluate(()=>({id:idleDeck.active.id,playing:!idleDeck.active.video.paused})),{id:'red',playing:true});
  console.log('PASS: a single idle clip loops');
  assert.deepEqual(errors,[]);
 } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
