
/* ---------- __SID__ · minimal-close (adapted from Velcure scene 9; MBA scene 10 has the same structure) ---------- */
const __P__D=__DATA__;
def({id:'__SID__',chapter:__CHAPTER__,letterbox:__LETTERBOX__,mood:__MOOD__,
  html:()=>`<div class="__C__-light" data-r="light"></div>
  <div class="__C__-l __C__-l1" data-r="l1">${FD_ESC(__P__D.line1)}</div>
  <div class="__C__-l __C__-l2" data-r="l2">${FD_ESC(__P__D.line2)}</div>
  <div class="__C__-big" data-r="big">${FD_ESC(__P__D.bigWord)}</div>
  <div class="__C__-k" data-r="k">${FD_ESC(__P__D.caption)}</div>
  <div class="__C__-ty" data-r="ty">${FD_ESC(__P__D.thanks)}</div>`,
  init(r){ splitChars(r.l1); const cs=splitChars(r.l2), at=__P__D.emphasis?__P__D.line2.indexOf(__P__D.emphasis):-1; if(at>=0) cs.forEach((c,i)=>{ if(i>=at&&i<at+__P__D.emphasis.length) c.classList.add('hi') });
    gsap.set([r.light,...$$('.ch',r.l1),...cs,r.big,r.k,r.ty],{opacity:0}) },
  enter(){ FX.release(); FX.set({mode:'drift',trail:0,speed:.3,size:.7,mix:[1,.15,0,0]}); gsap.to(FX.S,{alpha:.08,duration:2}) },
  steps:[
    function(tl,r){ tl.to(r.light,{opacity:1,duration:3},0).fromTo($$('.ch',r.l1),{opacity:0,filter:'blur(10px)',y:10},{opacity:1,filter:'blur(0px)',y:0,duration:1.4,stagger:.035,ease:'power2.out'},.2).call(()=>sfx('chime',220,.12),null,.2) },
    function(tl,r){ tl.to(r.l1,{opacity:.45,duration:1},0).fromTo($$('.ch',r.l2),{opacity:0,filter:'blur(10px)',y:10},{opacity:1,filter:'blur(0px)',y:0,duration:1.2,stagger:.025,ease:'power2.out'},.3).call(()=>sfx('chime',329.63,.12),null,.3).call(()=>sfx('chime',440,.12),null,2.0) },
    function(tl,r,s){ const close=__P__D.variant==='close';
      tl.to([r.l1,r.l2],{opacity:0,y:-24,filter:'blur(10px)',duration:.8,ease:'power2.in'},0);
      if(close) tl.to(FX.S,{gain:0,duration:2},0).call(()=>SND.mood(.22,180),null,0);
      tl.fromTo(r.big,{opacity:0,scale:1.12,filter:'blur(24px)'},{opacity:1,scale:1,filter:'blur(0px)',duration:2,ease:'power2.out'},.9).call(()=>sfx('boom',.8),null,.9)
        .fromTo(r.k,{opacity:0,letterSpacing:'0.9em'},{opacity:1,letterSpacing:'0.44em',duration:1.8,ease:'power2.out'},1.8)
        .fromTo(r.ty,{opacity:0,y:16},{opacity:1,y:0,duration:1.2},2.6).call(()=>sfx('chime',220,.14),null,2.6)
        .call(()=>loop(s,gsap.fromTo(r.big,{backgroundPosition:'100% 0'},{backgroundPosition:'0% 0',duration:3.2,repeat:-1,repeatDelay:3,ease:'power1.inOut'})),null,2.6) }
  ]});
