/* Short overlapping audio grains follow a paused video's scrub position; decoded clips back the idle loop and the summon video. */
const ScrollSound=(()=>{
  let context=null,forward=null,reverse=null,previous=null,lastGrain=-Infinity;
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
  function stop(){for(const v of voices){try{v.stop();}catch{}}voices.clear();}
  function begin(){stop();previous=0;lastGrain=-Infinity;if(context&&context.state!=='running')context.resume().catch(()=>{});}
  function has(name){return !!(context&&clips[name]);}
  // Play a decoded clip from `offset` seconds (looping for the idle bed). Returns false only when Web Audio
  // cannot carry it, so the caller can fall back to the video element's own audio track.
  function cue(name,offset,muted,loop=false,rate=1){
    stop();if(muted)return true;
    if(!has(name))return false;
    if(context.state!=='running')context.resume().catch(()=>{});
    const buffer=clips[name],source=context.createBufferSource();source.buffer=buffer;source.loop=loop;source.playbackRate.value=rate;
    source.connect(context.destination);voices.add(source);
    source.onended=()=>{voices.delete(source);source.disconnect();};
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
    source.connect(gain);gain.connect(context.destination);voices.add(source);
    source.onended=()=>{voices.delete(source);source.disconnect();gain.disconnect();};
    source.start(now,offset,duration);
  }
  if(typeof fetch==='function')prepare();
  return {addClip,begin,cue,has,loop,scrub,stop};
})();
