/* SWC2026 APAC Cup Lucky Draw — Service Worker
   앱 자산을 사전 캐싱해 오프라인에서도 동작하게 한다.
   ※ 앱을 수정·재배포할 때는 CACHE 버전을 올려야 태블릿이 새 버전을 받는다. */
const CACHE = 'swc2026-apac-lucky-draw-v1';
const ASSETS = [
  './idle-video.js',
  './result-video.js',
  './figure.css',
  './draw-engine.js',
  './figure.js',
  './scroll-audio.js',
  './assets/figure/scroll.webp',
  './assets/figure/scroll-card.webp',
  './assets/figure/zeratu.webp',
  './assets/figure/arena.webp',
  './assets/figure/sacred-idle.mp4',
  './assets/figure/sacred-open.mp4',
  './assets/figure/sacred-open.wav',
  './assets/figure/sacred-idle.wav',
  './assets/figure/sacred-poster.jpg',
  './assets/figure/zeratu-summon.mp4',
  './assets/figure/zeratu-summon.jpg',
  './assets/figure/zeratu-summon.wav',
  './assets/frames/frame-normal.png?v=2',
  './assets/frames/frame-purple-card.png?v=2',
  './assets/frames/frame-gold-card.png?v=2',
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/idle-fallback.jpg',
  './assets/com2us-store-logo-white.svg',
  './assets/com2us-store-lockup-white.svg',
  './assets/fonts/Pretendard-Light.otf',
  './assets/fonts/Pretendard-Regular.otf',
  './assets/fonts/Pretendard-Medium.otf',
  './assets/fonts/Pretendard-SemiBold.otf',
  './assets/fonts/Pretendard-Bold.otf',
  './assets/fonts/Pretendard-ExtraBold.otf',
  './assets/fonts/Pretendard-Black.otf',
  './assets/fonts/Gyoza-Black.otf',
  './assets/fonts/CookieRun-Regular.ttf',
  './assets/fonts/CookieRun-Bold.ttf',
  './assets/fonts/CookieRun-Black.ttf',
  './assets/badges/badge-a.png',
  './assets/badges/badge-b.png',
  './assets/badges/badge-c.png',
  './assets/badges/badge-d.png',
  './assets/badges/badge-e.png',
  './assets/badges/badge-f.png',
  './assets/badges/badge-special.png',
  './assets/badges/badge-lucky.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(url=>new Request(url,{cache:'reload'})))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('swc2026-apac-lucky-draw-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* 캐시 우선(cache-first): 캐시에 있으면 즉시 반환, 없으면 네트워크 후 캐시에 저장.
   업로드한 이미지·영상·BGM은 IndexedDB에 있으므로 SW 캐싱 대상이 아니다. */
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if(new URL(e.request.url).origin!==self.location.origin)return;
  e.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const hit=await cache.match(e.request);
    if(hit){
      const range=e.request.headers.get('range');
      if(range){
        const bytes=await hit.arrayBuffer(),match=/^bytes=(\d*)-(\d*)$/.exec(range);
        if(!match)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${bytes.byteLength}`}});
        const start=match[1]?Number(match[1]):Math.max(0,bytes.byteLength-Number(match[2]));
        const end=match[1]&&match[2]?Math.min(Number(match[2]),bytes.byteLength-1):bytes.byteLength-1;
        if(start>end||start>=bytes.byteLength)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${bytes.byteLength}`}});
        return new Response(bytes.slice(start,end+1),{status:206,headers:{'Content-Type':hit.headers.get('Content-Type')||'video/mp4','Content-Range':`bytes ${start}-${end}/${bytes.byteLength}`,'Content-Length':String(end-start+1),'Accept-Ranges':'bytes'}});
      }
      return hit;
    }
    try{
      const response=await fetch(e.request);
      if(response.status===200&&response.type==='basic')e.waitUntil(cache.put(e.request,response.clone()).catch(()=>{}));
      return response;
    }catch{
      if(e.request.mode==='navigate'){const page=await cache.match('./index.html');if(page)return page;}
      return new Response('Offline resource unavailable',{status:503,statusText:'Offline'});
    }
  })());
});
