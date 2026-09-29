/* Pure draw rules, shared by the kiosk and regression checks.
   Grades: figure = 상급 (the only grade under probability and time rules), normal = 일반 (a win drawn
   by stock like participation), participation = 참가상. */
(function(root){
  function kindOf(p){return p.kind || (p.tier==='high'?'figure':'participation');}
  function candidates(ips, stock, kind){
    const out=[];
    ips.forEach(ip=>ip.prizes.forEach((p,i)=>{
      if(p.hidden || kindOf(p)!==kind) return;
      const cell=(stock[ip.id]||[])[i];
      const add=(count,sub)=>{ if(Number.isInteger(count)&&count>0) out.push({ip,p,index:i,sub,count}); };
      if(Array.isArray(cell)) cell.forEach((n,j)=>{if(p.subs&&p.subs[j])add(n,j);});
      else add(cell,null);
    }));
    return out;
  }
  function availability(ips,stock,percent=null){
    const figures=candidates(ips,stock,'figure'), normal=candidates(ips,stock,'normal'), participation=candidates(ips,stock,'participation');
    // Outside the 상급 draw, 일반 and 참가상 share one stock-weighted pool.
    const rest=[...normal,...participation];
    if(percent===null) return figures.length||rest.length ? {ok:true,figures,normal,participation,rest} : {ok:false,reason:'추첨 가능한 경품이 모두 소진되었습니다.'};
    if(!Number.isFinite(percent)||percent<0||percent>100) return {ok:false,reason:'상급 당첨 확률을 0~100%로 설정해주세요.'};
    if(percent<100&&!rest.length) return {ok:false,reason:'일반·참가상 재고를 준비해주세요.'};
    if(percent===100&&!figures.length) return {ok:false,reason:'상급 경품이 모두 소진되었습니다.'};
    return {ok:true,figures,normal,participation,rest};
  }
  function draw(ips,stock,percent=null,random=Math.random){
    const state=availability(ips,stock,percent);
    if(!state.ok) throw Error(state.reason);
    const selectedKind=percent===null?null:state.figures.length&&random()<percent/100?'figure':'rest';
    const pool=selectedKind===null?[...state.figures,...state.rest]:selectedKind==='figure'?state.figures:state.rest;
    let ticket=random()*pool.reduce((n,c)=>n+c.count,0);
    let hit=pool[pool.length-1];
    for(const candidate of pool){ticket-=candidate.count;if(ticket<0){hit=candidate;break;}}
    const next=JSON.parse(JSON.stringify(stock));
    if(hit.sub==null)next[hit.ip.id][hit.index]--;else next[hit.ip.id][hit.index][hit.sub]--;
    const kind=kindOf(hit.p);
    return {...hit,kind,stock:next};
  }
  function intervalRelease(config,index){
    // Stable per-session seed + interval index: no finite schedule or reroll on reload.
    let hash=2166136261;
    for(const ch of String(config.figureIntervalSeed)+':'+index){hash=Math.imul(hash^ch.charCodeAt(0),16777619);}
    hash^=hash>>>16;hash=Math.imul(hash,0x7feb352d);hash^=hash>>>15;hash=Math.imul(hash,0x846ca68b);hash^=hash>>>16;
    return Date.parse(config.figureIntervalStart)+(index+(hash>>>0)/4294967296)*Number(config.figureIntervalMin)*60000;
  }
  function timeGate(config,logs,now=Date.now()){
    const wins=logs.filter(l=>l.kind==='figure').map(l=>Date.parse(l.timestamp)).filter(Number.isFinite);
    if(config.figureIntervalEnabled===true){
      const start=Date.parse(config.figureIntervalStart),duration=Number(config.figureIntervalMin)*60000,seed=config.figureIntervalSeed;
      if(!Number.isFinite(start)||!Number.isFinite(duration)||duration<=0||typeof seed!=='string'||!seed)return {blocked:true,reason:'구간 설정을 저장해주세요.'};
      const index=Math.floor((now-start)/duration);
      if(index<0)return {blocked:true,reason:'피규어 배정 운영 시간 밖입니다.'};
      const from=start+index*duration;
      if(wins.some(t=>t>=from&&t<from+duration))return {blocked:true,reason:'이 구간의 피규어가 이미 당첨되었습니다.'};
      if(now<intervalRelease(config,index))return {blocked:true,reason:'이 구간의 당첨 시각 전입니다.'};
      return {blocked:false,guaranteed:true};
    }
    if(config.figureCooldownEnabled===true){
      const minutes=Number(config.cooldownMin);
      if(!Number.isFinite(minutes)||minutes<0)return {blocked:true,reason:'쿨다운 설정을 확인해주세요.'};
      if(wins.some(t=>t+minutes*60000>now))return {blocked:true,reason:'피규어 당첨 쿨다운 중입니다.'};
    }
    return {blocked:false};
  }
  root.FigureDrawEngine={kindOf,candidates,availability,draw,timeGate,intervalRelease};
})(typeof module==='object'?module.exports:globalThis);
