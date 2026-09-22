// Generate isolated diagnostic snapshots from immutable commits, without changing the production app.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const versions={v8:'7ee9060',v9:'ec217dc',v11:'b49b159'};
for(const [version,commit] of Object.entries(versions)){
 const dir=path.join('app','review',version);fs.mkdirSync(dir,{recursive:true});
 const get=name=>execFileSync('git',['show',`${commit}:app/${name}`],{maxBuffer:8*1024*1024});
 for(const name of ['figure.js','figure.css','draw-engine.js','scroll-audio.js']){let data=get(name);if(name.endsWith('.css'))data=data.toString().replaceAll("url('assets/","url('../../assets/");fs.writeFileSync(path.join(dir,name),data);}
 let html=get('index.html').toString().replaceAll('figure-draw','swc2026-apac-lucky-draw');
 html=html.replace('<head>','<head><base href="../../">');
 for(const name of ['figure.js','figure.css','draw-engine.js','scroll-audio.js'])html=html.replaceAll(`"${name}"`,`"review/${version}/${name}"`);
 // Copy settings/stock into a separate namespace. Media is shared read-only, so uploaded idle video/BGM stay identical.
 const prefix=`swc2026-apac-review-${version}.`;
 const keys=['config.v1','stock.v1','log.v1','cooldown.v1','draw-state.v1'];
 const init=`<script>for(const key of ${JSON.stringify(keys)}){const value=localStorage.getItem('swc2026-apac-lucky-draw.'+key);if(value!==null)localStorage.setItem(${JSON.stringify(prefix)}+key,value);else localStorage.removeItem(${JSON.stringify(prefix)}+key);}</script>`;
 html=html.replaceAll('swc2026-apac-lucky-draw.',prefix);
 html=html.replace('<head>','<head>'+init);
 // Prevent snapshots from registering/unregistering service workers or modifying shared media.
 html=html.replace("if('serviceWorker' in navigator){","if(false){");
 html=html.replaceAll("idb.transaction('media','readwrite')","idb.transaction('media','readonly')");
 html=html.replace('</head>',`<style>#admin-tap{display:none!important}#version-review-label{position:fixed;top:0;left:0;z-index:9999;background:#fff;color:#111;font:12px system-ui;padding:3px 8px;pointer-events:none}</style></head>`);
 html=html.replace('<body>',`<body><div id="version-review-label">비교용 ${version} · ${commit} · 운영 재고 변경 없음</div>`);
 if(version==='v8'){fs.writeFileSync(path.join(dir,'idle.mp4'),get('assets/figure/idle.mp4'));html=html.replaceAll('assets/figure/idle.mp4',`review/${version}/idle.mp4`);}
 html=html.replace('</body>','<script src="review/recorder.js"></script></body>');
 fs.writeFileSync(path.join(dir,'index.html'),html);
 console.log(`${version}: generated from ${commit}, isolated stock/config; shared media read-only`);
}
