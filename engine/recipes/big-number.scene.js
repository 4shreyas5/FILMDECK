/* ---------- __SID__ · big-number (composite of Velcure readout/counter timing and the giant-word reveal) ---------- */
const __P__D=__DATA__;
const __P__T=(()=>{ const d=__P__D.value.display, m=/\d[\d,]*(?:\.\d+)?/.exec(d); if(!m||__P__D.value.kind==='range') return null; const tok=m[0]; return {pre:d.slice(0,m.index),post:d.slice(m.index+tok.length),to:parseFloat(tok.replace(/,/g,'')),dec:(tok.split('.')[1]||'').length,comma:tok.includes(',')} })();
const __P__fmt=v=>{ const T=__P__T; let s=v.toFixed(T.dec); if(T.comma){ const a=s.split('.'); s=a[0].replace(/\B(?=(\d{3})+(?!\d))/g,',')+(a[1]?'.'+a[1]:'') } return T.pre+s+T.post };
const __P__S=Math.max(150,Math.min(400,Math.floor(1560/(Math.max(1,__P__D.value.display.length)*0.56))));
def({id:'__SID__',chapter:__CHAPTER__,letterbox:__LETTERBOX__,mood:__MOOD__,
  html:()=>`${titleHTML(FD_ESC(__P__D.kicker),FD_ESC(__P__D.title))}
  <div class="__C__-l" data-r="l">${FD_ESC(__P__D.label)}</div>
  <div class="__C__-n" data-r="n" style="font-size:${__P__S}px;color:${__P__D.toneVars[__P__D.tone]}">${FD_ESC(__P__D.value.display)}</div>
  <div class="__C__-c" data-r="c">${FD_ESC(__P__D.context)}</div>
  ${__P__D.compare?`<div class="__C__-f" data-r="f"><span>${FD_ESC(__P__D.compare.label)}</span><b>${FD_ESC(__P__D.compare.value.display)}</b></div>`:''}`,
  init(r){ if(__P__T) r.n.textContent=__P__fmt(0); gsap.set([r.l,r.n,r.c,r.f].filter(Boolean),{opacity:0}) },
  enter(){ FX.release(); FX.set({mode:'drift',alpha:.22,trail:0,size:.85,speed:.6,mix:[1,.25,.2,.25]}) },
  steps:[
    function(tl,r,s){ titleIn(tl,s,0); tl.fromTo(r.l,{opacity:0,y:20},{opacity:1,y:0,duration:.8},.5).call(()=>sfx('riser',.6,.2),null,.3) },
    function(tl,r){ const o={v:0}; tl.fromTo(r.n,{opacity:0,scale:1.5,filter:'blur(16px)'},{opacity:1,scale:1,filter:'blur(0px)',duration:.55,ease:'expo.in'},0);
      if(__P__T) tl.to(o,{v:__P__T.to,duration:1.3,ease:'power3.out',onUpdate(){ r.n.textContent=__P__fmt(o.v) },onComplete(){ r.n.textContent=__P__D.value.display }},0);
      tl.call(()=>{ sfx('boom',1); shake(14); flash(.18) },null,.55) },
    function(tl,r){ tl.fromTo(r.c,{opacity:0,y:24,filter:'blur(8px)'},{opacity:1,y:0,filter:'blur(0px)',duration:.9},0).call(()=>sfx('chime',392,.16),null,0);
      if(r.f) tl.fromTo(r.f,{opacity:0,y:16},{opacity:1,y:0,duration:.7},.7) }
  ]});
