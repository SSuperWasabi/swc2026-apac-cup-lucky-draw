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
  await page.evaluate(()=>{stock={ip1:[1,0]};cfg.muted=true;refreshIdleSoldout();
   window.__confetti=0;new MutationObserver(()=>window.__confetti++).observe(document.getElementById('confetti'),{childList:true});
   // Video position when the result screen becomes active (the white lifts right after).
   new MutationObserver(()=>{const r=document.getElementById('scr-result');if(r.classList.contains('active')&&window.__winAtEntry===undefined)window.__winAtEntry=document.getElementById('win-video').currentTime;}).observe(document.getElementById('scr-result'),{attributes:true,attributeFilter:['class']});});
  await page.locator('#idle-banner').click();
  await page.waitForFunction(()=>document.getElementById('choose-stage').classList.contains('is-interactive'),null,{timeout:5000});
  await page.locator('#scroll-grid .scroll-choice').first().click();await page.locator('#scroll-next').click();await page.waitForTimeout(800);
  await page.locator('#scroll-drag').focus();await page.keyboard.press('Enter'); // automatic 1.8x opening
  await page.waitForFunction(()=>currentScreen==='scr-result',null,{timeout:15000});
  const entered=Date.now();
  await page.waitForTimeout(3200); // staff check fades in 2.4-2.8 s
  const s=await page.evaluate(()=>({win:document.getElementById('scr-result').classList.contains('oap-win'),playing:!document.getElementById('win-video').paused,
   atEntry:window.__winAtEntry,t:document.getElementById('win-video').currentTime,staff:document.getElementById('win-staff').textContent,staffOpacity:getComputedStyle(document.getElementById('win-staff')).opacity,
   summon:document.getElementById('summon-stage').classList.contains('active'),confetti:window.__confetti,log:logArr.at(-1),stock:JSON.stringify(stock),
   cover:(()=>{const r=document.getElementById('win-stage').getBoundingClientRect();return [r.width,r.height];})()}));
  assert.equal(s.win,true);assert.equal(s.playing,true);assert.equal(s.summon,false);assert.equal(s.confetti,0);
  assert.ok(s.atEntry<0.2,`win video starts at its first frame (t=${s.atEntry} at result entry)`);
  assert.deepEqual(s.cover,[1024,1366]);assert.equal(s.log.kind,'figure');assert.equal(s.stock,'{"ip1":[0,0]}');
  assert.match(s.staff,new RegExp(`^SHOW THIS SCREEN TO STAFFNo\\. ${s.log.serial} · \\d\\d:\\d\\d:\\d\\d$`));assert.equal(s.staffOpacity,'1');
  await page.screenshot({path:'.tools/win-v5.png'});
  console.log('PASS: figure win -> full-screen AE win video from t=%s s (no summon clip, no confetti), staff check No. %s, stock/log committed',s.atEntry.toFixed(3),s.log.serial);
  await page.waitForFunction(()=>currentScreen==='scr-idle',null,{timeout:8000});
  const back=(Date.now()-entered)/1000;
  assert.ok(back>4.5&&back<6,`five-second return (${back}s)`);
  assert.deepEqual(await page.evaluate(()=>({paused:document.getElementById('win-video').paused,t:document.getElementById('win-video').currentTime})),{paused:true,t:0});
  console.log('PASS: returns home after %s s and parks the win video at frame 0',back.toFixed(1));
  assert.deepEqual(errors,[]);
 } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
