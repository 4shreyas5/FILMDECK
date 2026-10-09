
/* ---------- __SID__ · gauge-needle (adapted from Velcure scene 2, beats 1 to 3) ---------- */
const __P__D=__DATA__;
const __P__G={cx:960,cy:700,R:300};
const __P__f=v=>(v-__P__D.scale.min)/(__P__D.scale.max-__P__D.scale.min);
const __P__pt=(v,rr)=>{ const th=Math.PI+__P__f(v)*Math.PI; return [__P__G.cx+rr*Math.cos(th),__P__G.cy+rr*Math.sin(th)] };
const __P__arc=(a,b,rr)=>{ const p=__P__pt(a,rr),q=__P__pt(b,rr); return `M${p[0].toFixed(1)} ${p[1].toFixed(1)} A${rr} ${rr} 0 0 1 ${q[0].toFixed(1)} ${q[1].toFixed(1)}` };
const __P__dec=v=>(String(v).split('.')[1]||'').length;
const __P__band=fc=>{ const S=__P__D.scale, w=(S.max-S.min)*.027; let lo=fc.lo, hi=fc.hi; if(hi-lo<w){ lo=fc.v-w; hi=fc.v+w } return [Math.max(S.min,lo),Math.min(S.max,hi)] };
def({id:'__SID__',chapter:__CHAPTER__,letterbox:__LETTERBOX__,mood:__MOOD__,
  html:()=>{ const S=__P__D.scale, G=__P__G, nMin=Math.round((S.max-S.min)/S.minorStep); let ticks='';
    for(let i=0;i<=nMin;i++){ const v=+(S.min+i*S.minorStep).toFixed(6), k=(v-S.min)/S.majorStep, mj=Math.abs(k-Math.round(k))<1e-6, a=__P__pt(v,G.R+16), b=__P__pt(v,G.R+(mj?42:28));
      ticks+=`<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" class="__C__-tk${mj?' mj':''}"/>`;
      if(mj){ const l=__P__pt(v,G.R+74); ticks+=`<text class="__C__-tl" x="${l[0].toFixed(1)}" y="${(l[1]+6).toFixed(1)}">${FD_ESC(v+S.unit)}</text>` } }
    const bb=__P__band(__P__D.before), bh=__P__band(__P__D.after);
    return `${titleHTML(FD_ESC(__P__D.kicker),FD_ESC(__P__D.title))}
    <div class="__C__-a" data-r="a" style="--tone:${__P__D.toneVar}">
      <svg class="full" viewBox="0 0 1920 1080">
        <path class="__C__-trk" data-r="trk" pathLength="1" d="${__P__arc(S.min,S.max,G.R)}"/>
        <g data-r="tks" opacity="0">${ticks}</g>
        <path class="__C__-band" data-r="bb" pathLength="1" d="${__P__arc(bb[0],bb[1],G.R)}"/>
        <path class="__C__-band hot" data-r="bh" pathLength="1" d="${__P__arc(bh[0],bh[1],G.R)}"/>
        <g data-r="ndl" opacity="0"><line class="__C__-nd" x1="${G.cx}" y1="${G.cy}" x2="${G.cx-G.R+40}" y2="${G.cy}"/><circle cx="${G.cx}" cy="${G.cy}" r="16" fill="#EEE9E0"/></g>
      </svg>
      <div class="__C__-read" data-r="rd"><div class="l" data-r="rl">${FD_ESC(__P__D.labelBefore)}</div><div class="n" data-r="rn"></div></div>
    </div>
    ${__P__D.caption?`<div class="__C__-cap" data-r="cap">${FD_ESC(__P__D.caption)}</div>`:''}` },
  init(r){ gsap.set(r.ndl,{rotation:0,svgOrigin:`${__P__G.cx} ${__P__G.cy}`}); gsap.set(r.rd,{xPercent:-50}); gsap.set([r.rd,...(r.cap?[r.cap]:[])],{opacity:0}); r.rn.textContent='0'+__P__D.scale.unit },
  enter(){ FX.release(); FX.set({mode:'drift',alpha:.22,trail:0,size:.85,speed:.6,mix:[1,.15,.3,.2]}) },
  steps:[
    function(tl,r,s){ titleIn(tl,s,0); tl.to(r.trk,{strokeDashoffset:0,duration:1.2,ease:'power2.inOut'},.3).to(r.tks,{opacity:1,duration:.8},.8).to(r.ndl,{opacity:1,duration:.5},1.0).call(()=>sfx('riser',1,.15),null,.3) },
    function(tl,r){ const o={v:__P__D.scale.min}, B=__P__D.before, S=__P__D.scale, d=__P__dec(B.v);
      tl.to(r.rd,{opacity:1,duration:.5},0)
        .to(r.ndl,{rotation:__P__f(B.v)*180,svgOrigin:`${__P__G.cx} ${__P__G.cy}`,duration:1.4,ease:'power3.out'},0)
        .to(o,{v:B.v,duration:1.4,ease:'power3.out',onUpdate(){ r.rn.textContent=o.v.toFixed(d)+S.unit },onComplete(){ r.rn.textContent=B.display }},0)
        .to(r.bb,{strokeDashoffset:0,duration:.6},.9).call(()=>{ sfx('hit',.5); sfx('blip',520) },null,1.0) },
    function(tl,r){ const A=__P__D.after, B=__P__D.before, S=__P__D.scale, o={v:B.v}, d=Math.max(__P__dec(A.v),__P__dec(B.v));
      tl.to(r.bb,{opacity:.35,duration:.4},0)
        .to(r.ndl,{rotation:__P__f(A.v)*180,svgOrigin:`${__P__G.cx} ${__P__G.cy}`,duration:1.2,ease:'elastic.out(1.1,.35)'},.15)
        .to(o,{v:A.v,duration:.6,onUpdate(){ r.rn.textContent=o.v.toFixed(d)+S.unit },onComplete(){ r.rn.textContent=A.display }},.15)
        .call(()=>{ r.rl.textContent=__P__D.labelAfter; r.rn.style.color='var(--tone)'; sfx('boom',1); sfx('glitch'); shake(14); flash(.15) },null,.2)
        .to(r.bh,{strokeDashoffset:0,duration:.5},.3);
      if(r.cap) tl.fromTo(r.cap,{opacity:0,y:20},{opacity:1,y:0,duration:.8},.9) }
  ]});
