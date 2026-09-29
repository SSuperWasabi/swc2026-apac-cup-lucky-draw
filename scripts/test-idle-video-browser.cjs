// Isolated Chrome profile + local server: never opens the operator's stored data.
const {chromium}=require('../.tools/node_modules/playwright-core');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve('app'),clip=path.resolve(process.argv[2]||'app/assets/figure/sacred-idle.mp4');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.mp4':'video/mp4','.wav':'audio/wav','.jpg':'image/jpeg','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'};
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file=pathname==='/test-idle.mp4'?clip:path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(file!==clip&&!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  fs.stat(file,(err,stat)=>{
    if(err||!stat.isFile()){res.writeHead(404).end();return;}
    const range=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||'');
    const start=range?Number(range[1]):0,end=range&&range[2]?Math.min(Number(range[2]),stat.size-1):stat.size-1;
    if(start>end){res.writeHead(416).end();return;}
    res.writeHead(range?206:200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Accept-Ranges':'bytes','Content-Length':end-start+1,...(range?{'Content-Range':`bytes ${start}-${end}/${stat.size}`}:{})});
    fs.createReadStream(file,{start,end}).pipe(res);
  });
});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1024,height:1366},serviceWorkers:'block'});
  // Immediate screen swaps: the transition has its own suite (test-transition-browser). In-memory only.
  await page.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{if(typeof cfg!=='undefined')cfg.screenTransitions=false;}));
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>typeof idleDeck!=='undefined'&&typeof idb!=='undefined'&&!!idb);
    await page.evaluate(async()=>{
      const buf=await(await fetch('/test-idle.mp4')).arrayBuffer();
      for(const id of ['probe-a','probe-b','probe-c'])await idbPut('idlevid_'+id,{buf,type:'video/mp4'});
      stock={ip1:[0,100]};cfg.muted=true;cfg.idleVideos=['probe-a','probe-b','probe-c'].map(id=>({id}));
      await bootIdle();refreshIdleSoldout();
    });
    const ready=()=>page.waitForFunction(()=>idleDeck.next?.state==='ready'&&idleDeck.next.video.paused&&!idleDeck.next.video.seeking,{},{timeout:30000});
    await ready();
    assert.equal(await page.locator('#idle-video-poster').count(),0);
    assert.equal(await page.locator('.idle-media-slot').count(),2);
    const results=[];
    for(let round=0;round<12;round++){
      await ready();
      await page.evaluate(()=>{
        window.expectedIdle=idleDeck.next;window.oldIdle=idleDeck.active;
        window.entryCalls={load:0,seek:0,source:0,waiting:0};
        const v=expectedIdle.video,calls=entryCalls;
        const load=v.load.bind(v),set=v.setAttribute.bind(v);
        v.load=(...args)=>{calls.load++;return load(...args);};
        v.setAttribute=(name,value)=>{if(name==='src')calls.source++;return set(name,value);};
        const seek=()=>calls.seek++,waiting=()=>calls.waiting++;
        v.addEventListener('seeking',seek);v.addEventListener('waiting',waiting);
        window.restoreIdleProbe=()=>{v.load=load;v.setAttribute=set;v.removeEventListener('seeking',seek);v.removeEventListener('waiting',waiting);};
        window.expectedSource=v.currentSrc;
      });
      await page.locator('#idle-banner').click();
      assert.equal(await page.evaluate(()=>oldIdle.video.paused),true);
      const before=await page.evaluate(()=>({preparedTime:expectedIdle.video.currentTime,standby:!expectedIdle.video.classList.contains('is-current'),display:getComputedStyle(expectedIdle.video).display,cover:getComputedStyle(document.getElementById('idle-media-cover')).display}));
      assert.ok(before.preparedTime<.04,JSON.stringify(before));assert.equal(before.standby,true);assert.notEqual(before.display,'none');assert.notEqual(before.cover,'none');
      // Exercise actual participant back button; another route uses the result timer below.
      await page.locator('#scr-scrolls .back').click();
      await page.waitForFunction(()=>idleDeck.active===expectedIdle&&!expectedIdle.video.paused&&expectedIdle.video.currentTime>0,{},{timeout:10000});
      await page.waitForFunction(()=>{const entry=idleVideoDiagnostics.findLast(e=>e.event==='enter');return idleVideoDiagnostics.some(e=>e.event==='entry-frame'&&e.id===entry.id&&e.at>=entry.at);});
      if(round===0)await page.waitForTimeout(2100); // Include the first two seconds, not just play().
      const result=await page.evaluate(()=>({same:idleDeck.active===expectedIdle,source:expectedIdle.video.currentSrc===expectedSource,id:document.getElementById('idle-video').dataset.idleId,expected:expectedIdle.id,calls:{...entryCalls},enter:idleVideoDiagnostics.findLast(e=>e.event==='enter'),frame:idleVideoDiagnostics.findLast(e=>e.event==='entry-frame')}));
      assert.equal(result.same,true);assert.equal(result.source,true);assert.equal(result.id,result.expected);assert.equal(result.enter.warm,true);
      assert.ok(result.frame.mediaTime<=.1,'next clip must start at the beginning, not a hidden-running midpoint');
      assert.deepEqual(result.calls,{load:0,seek:0,source:0,waiting:0});results.push(result.frame?.ms??null);
      await page.evaluate(()=>window.restoreIdleProbe());
    }
    console.log('PASS: 12 real button returns use the predecoded next element/start, with no load/seek/source reset/waiting; frame callback ms:',results);
    await ready();
    await page.evaluate(()=>{window.expectedIdle=idleDeck.next;go('scr-result');setTimeout(resetToIdle,50);});
    await page.waitForFunction(()=>currentScreen==='scr-idle'&&idleDeck.active===expectedIdle&&!expectedIdle.video.paused);
    assert.equal(await page.evaluate(()=>idleVideoDiagnostics.findLast(e=>e.event==='enter').warm),true);
    // Roster invalidation while a read is in flight must not resurrect a removed source.
    await page.evaluate(async()=>{
      const original=idbGet;window.releaseIdleRead=null;
      idbGet=async key=>{if(key==='idlevid_delayed')await new Promise(r=>window.releaseIdleRead=r);return original('idlevid_probe-a');};
      cfg.idleVideos=[{id:'delayed'}];bootIdle();
      await Promise.resolve();cfg.idleVideos=[];await bootIdle();
      window.releaseIdleRead();idbGet=original;
    });
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(()=>[...document.querySelectorAll('.idle-media-slot')].some(v=>v.hasAttribute('src'))),false);
    // A fast return before bytes arrive must target B, never temporarily replay A.
    // It is explicitly reported as a cold miss, not counted as a no-buffer pass.
    await page.evaluate(async()=>{cfg.idleVideos=[{id:'probe-a'},{id:'probe-b'}];await bootIdle();});
    await ready();
    await page.evaluate(()=>{
      idleDeck.dispose(idleDeck.next);idleDeck.next=null;
      const original=idbGet;window.originalIdleRead=original;
      idbGet=async key=>{await new Promise(r=>window.releaseColdRead=r);return original(key);};
      idleDeck.prime();window.expectedIdle=idleDeck.next;window.oldIdle=idleDeck.active;
      go('scr-scrolls');resetToIdle();
    });
    assert.equal(await page.evaluate(()=>currentScreen==='scr-idle'&&idleDeck.active===expectedIdle&&oldIdle.video.paused&&!oldIdle.video.classList.contains('is-current')),true);
    assert.equal(await page.evaluate(()=>idleVideoDiagnostics.findLast(e=>e.event==='enter').warm),false);
    assert.equal(await page.evaluate(()=>expectedIdle.video.classList.contains('has-frame')),false,'a reused slot must not expose its previous decoded image during a cold read');
    await page.evaluate(()=>{idbGet=window.originalIdleRead;window.releaseColdRead();});
    try{await page.waitForFunction(()=>idleDeck.active?.state==='ready'&&!idleDeck.active.video.paused,{},{timeout:30000});}
    catch(error){console.log(await page.evaluate(()=>({diagnostics:idleVideoDiagnostics,active:{state:idleDeck.active?.state,paused:idleDeck.active?.video.paused,ready:idleDeck.active?.video.readyState,source:idleDeck.active?.video.currentSrc}})));throw error;}
    await ready();
    await page.evaluate(()=>idleDeck.suspend());
    assert.equal(await page.evaluate(()=>[...document.querySelectorAll('.idle-media-slot')].every(v=>v.paused)),true);
    await page.evaluate(()=>idleDeck.resume());
    await page.waitForFunction(()=>!idleDeck.active.video.paused);
    assert.deepEqual(errors,[]);
    console.log('PASS: timer return, canceled roster reads, no old-clip fallback on forced cold miss, background suspension/resume; no page errors');
    console.log('Clip:',clip,'MiB:',(fs.statSync(clip).size/1048576).toFixed(2));
  }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
