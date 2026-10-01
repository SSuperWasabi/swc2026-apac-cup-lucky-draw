/* Short overlapping audio grains follow a paused video's scrub position; decoded clips back the idle loop and the summon video. */
const ScrollSound=(()=>{
  let context=null,forward=null,reverse=null,previous=null,lastGrain=-Infinity,master=null,volume=1;
  // 연출 소리 전체 볼륨(관리자 설정): 모든 소리를 이 노드를 거쳐 내보낸다.
  const out=()=>{if(!master&&context){master=context.createGain();master.gain.value=volume;master.connect(context.destination);}return master||context.destination;};
  function setVolume(v){volume=Math.max(0,Number(v)||0);if(master)master.gain.value=volume;}
  const voices=new Set(),clips={};
  async function load(url){const response=await fetch(url);if(!response.ok)throw Error('audio');return context.decodeAudioData(await response.arrayBuffer());}
  async function prepare(){
    try{
      const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
      context=typeof audioCtx==='function'?audioCtx():new Audio();
      forward=await load('assets/figure/sacred-open.wav');
      clips.open=forward; // Automatic reveal shares the decoded drag audio and BGM context.
      reverse=context.createBuffer(forward.numberOfChannels,forward.length,forward.sampleRate);
      for(let c=0;c<forward.numberOfChannels;c++){const src=forward.getChannelData(c),dst=reverse.getChannelData(c);for(let i=0;i<src.length;i++)dst[i]=src[src.length-1-i];}
      for(const [name,url] of [['idle','assets/figure/sacred-idle.wav'],['summon','assets/figure/zeratu-summon.wav']]){
        try{clips[name]=await load(url);}catch{ /* That video's own track is used instead. */ }
      }
    }catch{ /* Embedded video audio remains available for automatic playback. */ }
  }
  // Decode the audio track of an uploaded clip (MP4/AAC) so it can be cued like the bundled WAVs.
  async function addClip(name,buffer){
    if(!context||clips[name])return !!clips[name];
    try{clips[name]=await context.decodeAudioData(buffer.slice(0));return true;}catch{return false;}
  }
  // 업로드한 소리로 교체하거나(buffer) 지운다(null).
  function setClip(name,buffer){if(buffer)clips[name]=buffer;else delete clips[name];}
  // fade초 동안 줄이며 멈춘다. 줄어드는 소리는 바로 다음 cue가 끊지 않는다.
  function stop(fade=0){const now=context?context.currentTime:0;for(const v of voices){try{if(fade>0&&v.level){v.level.gain.setValueAtTime(v.level.gain.value,now);v.level.gain.linearRampToValueAtTime(0,now+fade);v.stop(now+fade);}else v.stop();}catch{}}voices.clear();}
  function begin(){stop();previous=0;lastGrain=-Infinity;if(context&&context.state!=='running')context.resume().catch(()=>{});}
  function has(name){return !!(context&&clips[name]);}
  // Play a decoded clip from `offset` seconds (looping for the idle bed). Returns false only when Web Audio
  // cannot carry it, so the caller can fall back to the video element's own audio track.
  function cue(name,offset,muted,loop=false,rate=1,gain=1){
    stop();if(muted)return true;
    if(!has(name))return false;
    if(context.state!=='running')context.resume().catch(()=>{});
    const buffer=clips[name],source=context.createBufferSource();source.buffer=buffer;source.loop=loop;source.playbackRate.value=rate;
    // 소리마다 볼륨 노드를 둔다(소리별 볼륨, 부드럽게 멈추기).
    const level=context.createGain();level.gain.value=Math.max(0,Number(gain)||0);source.level=level;
    source.connect(level);level.connect(out());voices.add(source);
    source.onended=()=>{voices.delete(source);source.disconnect();level.disconnect();};
    const at=Math.max(0,Number(offset)||0);
    source.start(0,loop?at%buffer.duration:Math.min(at,buffer.duration));
    return true;
  }
  function loop(offset,muted){return cue('idle',offset,muted,true);}
  function scrub(time,muted){
    const delta=previous===null?0:time-previous;previous=time;
    if(muted){stop();return;}
    if(!context||!forward||!reverse||context.state!=='running'||Math.abs(delta)<.004)return;
    const now=context.currentTime;if(now-lastGrain<.035)return;lastGrain=now;
    const backwards=delta<0,buffer=backwards?reverse:forward;
    const duration=Math.min(.10,buffer.duration),offset=Math.max(0,Math.min(buffer.duration-duration,backwards?buffer.duration-time:time));
    const source=context.createBufferSource(),gain=context.createGain();source.buffer=buffer;
    gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(.8,now+.008);gain.gain.setValueAtTime(.8,now+duration-.018);gain.gain.linearRampToValueAtTime(0,now+duration);
    source.connect(gain);gain.connect(out());voices.add(source);
    source.onended=()=>{voices.delete(source);source.disconnect();gain.disconnect();};
    source.start(now,offset,duration);
  }
  if(typeof fetch==='function')prepare();
  // 한 번 울리는 소리(소환서 터치음 등). 긁는 소리·연출 영상 소리의 stop()과 따로 관리해 서로 끊지 않는다.
  const fxVoices=new Map();
  function fx(name,gain=1,key=name){
    if(!has(name))return false;
    if(context.state!=='running')context.resume().catch(()=>{});
    const source=context.createBufferSource(),level=context.createGain();source.buffer=clips[name];level.gain.value=Math.max(0,Number(gain)||0);source.level=level;
    source.connect(level);level.connect(out());
    const set=fxVoices.get(key)||new Set();set.add(source);fxVoices.set(key,set);
    source.onended=()=>{set.delete(source);source.disconnect();level.disconnect();};
    source.start();return true;
  }
  // key로 묶인 소리를 fade초 동안 줄이며 멈춘다.
  function fadeFx(key,fade=.4){const set=fxVoices.get(key);if(!set||!context)return;const now=context.currentTime;for(const s of set){try{s.level.gain.cancelScheduledValues(now);s.level.gain.setValueAtTime(s.level.gain.value,now);s.level.gain.linearRampToValueAtTime(0,now+fade);s.stop(now+fade+.02);}catch{}}set.clear();}
  function fxActive(key){const set=fxVoices.get(key);return !!(set&&set.size);}
  return {addClip,begin,cue,has,loop,scrub,stop,setVolume,setClip,fx,fadeFx,fxActive};
})();
