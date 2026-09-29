/* Two persistent video slots: prepare the NEXT clip's start behind an opaque
   layer, then reveal that same element. Never reload or seek on a warm return. */
class IdleVideoDeck {
  constructor({videos, list, pick, read, toBlob, changed}) {
    Object.assign(this,{videos,list,pick,read,toBlob,changed});
    this.active=null;this.next=null;this.visible=true;this.suspended=false;this.roster=null;
    this.diagnostics=[];
    for(const video of videos){
      video.muted=true;video.playsInline=true;video.loop=true;video.autoplay=false;
      video.addEventListener('waiting',()=>{
        if(this.active?.video===video&&this.visible)this.record('waiting',this.active);
      });
      // While the idle screen stays up, each clip plays once and hands over to the prepared next clip
      // (shuffle-bag order from pick). A single clip, or a next clip not ready yet, simply loops again.
      video.addEventListener('ended',()=>{
        if(this.active?.video!==video||!this.visible||this.suspended)return;
        this.record('ended',this.active);
        if(this.next&&this.next.state==='ready'&&this.next.video.readyState>=2){this.enter();return;}
        video.currentTime=0;video.play().catch(e=>this.failed(this.active,e));
      });
      video.addEventListener('playing',()=>{
        if(this.active?.video===video&&this.visible){
          this.record('playing',this.active);
          this.changed(video);
          this.prime();
        }
      });
    }
  }
  record(event,entry,extra={}){
    this.diagnostics.push({event,id:entry?.id??null,at:Math.round(performance.now()),...extra});
    if(this.diagnostics.length>100)this.diagnostics.shift();
  }
  valid(entry){return !!entry&&!entry.controller.signal.aborted;}
  entryFrame(entry,frame){
    if(this.active!==entry||!this.visible||entry.frameLogged)return;
    entry.frameLogged=true;
    this.record('entry-frame',entry,{ms:Math.round(performance.now()-entry.enteredAt),mediaTime:frame?.mediaTime??entry.video.currentTime});
  }
  checkRoster(){
    const key=JSON.stringify(this.list().map(v=>v.id).sort());
    if(key!==this.roster){
      this.dispose(this.active);this.dispose(this.next);this.active=this.next=null;this.roster=key;
      this.changed(null);
    }
  }
  dispose(entry){
    if(!entry)return;
    entry.controller.abort();
    const v=entry.video;v.pause();v.removeAttribute('src');v.load();
    v.classList.remove('is-current','has-frame');delete v.dataset.idleId;delete v.dataset.prepared;
    delete v._idleBackdrop;delete v._backdropId;
    if(entry.url)URL.revokeObjectURL(entry.url);
  }
  wait(entry,events,test){
    const v=entry.video,signal=entry.controller.signal;
    return new Promise((resolve,reject)=>{
      let timer;
      const clean=()=>{clearTimeout(timer);for(const name of events)v.removeEventListener(name,check);v.removeEventListener('error',fail);signal.removeEventListener('abort',abort);};
      const check=()=>{if(test()){clean();resolve();}};
      const fail=()=>{clean();reject(new Error(v.error?.message||'Video preparation failed'));};
      const abort=()=>{clean();reject(new DOMException('Cancelled','AbortError'));};
      if(signal.aborted){abort();return;}
      for(const name of events)v.addEventListener(name,check);
      v.addEventListener('error',fail);signal.addEventListener('abort',abort,{once:true});
      timer=setTimeout(()=>{clean();reject(new Error('Video preparation timed out'));},15000);
      if(v.error)fail();else check();
    });
  }
  frame(entry){
    const v=entry.video,signal=entry.controller.signal;
    if(!v.requestVideoFrameCallback)return this.wait(entry,['timeupdate','playing'],()=>!v.paused&&v.readyState>=2);
    return new Promise((resolve,reject)=>{
      let callback,timer;
      const clean=()=>{clearTimeout(timer);v.cancelVideoFrameCallback(callback);signal.removeEventListener('abort',abort);};
      const abort=()=>{clean();reject(new DOMException('Cancelled','AbortError'));};
      if(signal.aborted){abort();return;}
      callback=v.requestVideoFrameCallback((_,metadata)=>{clean();resolve(metadata);});
      signal.addEventListener('abort',abort,{once:true});
      timer=setTimeout(()=>{clean();reject(new Error('No decoded video frame'));},15000);
    });
  }
  create(video){
    const item=this.pick(this.list());if(!item)return null;
    const entry={video,id:item.id,controller:new AbortController(),state:'reading',url:null};
    video.dataset.idleId=item.id;
    // Keep this promise handled even when a navigation invalidates the entry.
    entry.attached=this.read('idlevid_'+item.id).then(value=>{
      if(!this.valid(entry))return;
      const blob=typeof value==='string'?value:this.toBlob(value);
      if(!blob)throw new Error('Idle video is missing');
      const source=typeof blob==='string'?blob:(entry.url=URL.createObjectURL(blob));
      video.src=source;video.load();entry.state='decoding';
      this.record('source-attached',entry);
      entry.task=this.prepare(entry);
    }).catch(error=>this.failed(entry,error));
    return entry;
  }
  failed(entry,error){
    if(!this.valid(entry))return;
    entry.state='failed';entry.video.pause();
    this.record('failed',entry,{message:String(error.message||error)});
    if(entry===this.active&&this.visible)this.changed(entry.video);
  }
  async prepare(entry){
    if(entry.preparing||!this.valid(entry))return;
    entry.preparing=true;
    const v=entry.video;
    try{
      if(this.suspended){entry.state='suspended';return;}
      const frame=this.frame(entry);
      // Do not wait for preload/loadeddata before play: iOS may defer offscreen
      // preload. Explicit muted play drives decoding; the frame callback proves it.
      const play=v.play(),[,metadata]=await Promise.all([play,frame]);
      if(!this.valid(entry))return;
      if(this.suspended){v.pause();entry.state='suspended';return;}
      v.classList.add('has-frame');
      this.entryFrame(entry,metadata);
      if(entry!==this.active||!this.visible){
        v.pause();v.currentTime=0;
        await this.wait(entry,['seeked','loadeddata'],()=>!v.seeking&&v.readyState>=2);
      }
      if(!this.valid(entry))return;
      entry.state='ready';v.dataset.prepared='true';this.record('ready',entry);
      if(entry===this.active&&this.visible&&!this.suspended){v.play().catch(e=>this.failed(entry,e));this.changed(v);}
    }catch(error){this.failed(entry,error);}
    finally{entry.preparing=false;}
  }
  prime(){
    if(this.suspended)return null;
    this.checkRoster();
    if(this.next)return this.next;
    const video=this.videos.find(v=>v!==this.active?.video);
    this.next=this.create(video);
    return this.next;
  }
  enter({advance=true,visible=true}={}){
    this.checkRoster();this.visible=visible;
    if(!advance&&this.active){this.resume();return this.active.attached;}
    const previous=this.active,next=this.next||this.create(this.videos.find(v=>v!==previous?.video));
    this.next=null;this.active=next;
    // Loop only when there is nothing to switch to; otherwise the ended event advances the deck.
    if(next)next.video.loop=this.list().length<2;
    const started=performance.now();
    if(next){next.enteredAt=started;next.frameLogged=false;}
    const warm=!!next&&next.state==='ready'&&!next.video.seeking&&next.video.readyState>=2;
    this.record('enter',next,{warm,readyState:next?.video.readyState??0});
    // Change IDs/classes only: no node reparenting, src/load/currentTime here.
    for(const v of this.videos){v.id=v===next?.video?'idle-video':'idle-video-next';v.classList.toggle('is-current',v===next?.video);}
    if(!next)this.videos[0].id='idle-video';
    if(previous!==next)this.dispose(previous);
    this.changed(next?.video||null);
    if(next?.video.getAttribute('src')){
      this.frame(next).then(frame=>this.entryFrame(next,frame)).catch(()=>{});
      if(this.visible&&!this.suspended)next.video.play().catch(e=>this.failed(next,e));
    }
    return next?.attached||Promise.resolve();
  }
  leave(){
    this.visible=false;this.active?.video.pause();this.prime();
  }
  suspend(){this.suspended=true;for(const v of this.videos)v.pause();}
  resume(){
    this.suspended=false;
    if(this.visible&&this.active?.video.getAttribute('src')){
      if(this.active.state!=='ready'&&!this.active.preparing)this.active.task=this.prepare(this.active);
      else this.active.video.play().catch(e=>this.failed(this.active,e));
    }
    if(this.next&&this.next.state!=='reading'&&(this.next.state!=='ready'||this.next.video.readyState<2)){
      if(this.next.preparing)this.next.video.play().catch(e=>this.failed(this.next,e));
      else this.next.task=this.prepare(this.next);
    }
    // Do not start another IDB read in front of the first/just-selected source.
    if(this.active?.state==='ready')this.prime();
  }
}
