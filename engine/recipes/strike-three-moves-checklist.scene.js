
/* ---------- __SID__ · strike-three-moves-checklist (adapted from Velcure scene 8; strike drawn as a scaled bar because the reference's dashed-SVG strike renders as dashes) ---------- */
const __P__D=__DATA__;
def({id:'__SID__',chapter:__CHAPTER__,letterbox:__LETTERBOX__,mood:__MOOD__,
  html:()=>`<div class="__C__-h" data-r="h"><div class="a" data-r="ha">${FD_ESC(__P__D.headlineLead)}</div><div class="b"><span data-r="hb">${FD_ESC(__P__D.headlineStruck)}</span><i class="__C__-strike" data-r="sk"></i></div></div>
  <div class="__C__-s" data-r="sub">${FD_ESC(__P__D.sub.lead)}<em>${FD_ESC(__P__D.sub.accent)}</em></div>
  <div class="__C__-cols" data-r="cols">${__P__D.moves.map((c,i)=>`<div class="c"><div class="n">MOVE 0${i+1}</div><div class="h">${FD_ESC(c.head)}</div><div class="p">${FD_ESC(c.text)}</div></div>`).join('')}</div>
  <div class="__C__-list" data-r="list">${__P__D.checklist.map(x=>`<div class="it"><i></i><span>${FD_ESC(x)}</span></div>`).join('')}</div>`,
  init(r){ splitChars(r.ha); splitChars(r.hb); gsap.set(r.sk,{rotation:-1.6,scaleX:0,transformOrigin:'0% 50%'}); gsap.set([...$$('.ch',r.h),r.sub,...$$('.c',r.cols),...$$('.it',r.list)],{opacity:0}) },
  enter(){ FX.release(); FX.set({mode:'drift',alpha:.22,trail:0,size:.85,speed:.6,mix:[1,.3,.2,.2]}) },
  steps:[
    function(tl,r){ tl.fromTo($$('.ch',r.ha),{opacity:0,y:40},{opacity:1,y:0,duration:.6,stagger:.04,ease:'expo.out'},0).call(()=>sfx('hit',.6),null,0)
        .fromTo($$('.ch',r.hb),{opacity:0,scale:2.4,filter:'blur(20px)'},{opacity:1,scale:1,filter:'blur(0px)',duration:.5,stagger:.03,ease:'expo.in'},.5).call(()=>{ sfx('boom',1); shake(14); flash(.2) },null,1.1)
        .to(r.sk,{scaleX:1,duration:.35,ease:'power3.in'},1.7).call(()=>{ sfx('crack'); shake(10) },null,2.05) },
    function(tl,r){ tl.fromTo(r.sub,{opacity:0,y:30,filter:'blur(8px)'},{opacity:1,y:0,filter:'blur(0px)',duration:1},0).call(()=>sfx('chime',392,.16),null,0) },
    function(tl,r){ tl.to(r.sub,{opacity:0,duration:.4},0).to(r.h,{y:-210,scale:.4,transformOrigin:'50% 0%',duration:.9,ease:'power3.inOut'},0).call(()=>sfx('whoosh',.8,-1),null,0);
      $$('.c',r.cols).forEach((c,i)=>tl.fromTo(c,{opacity:0,y:50},{opacity:1,y:0,duration:.7,ease:'expo.out'},.7+i*.3).call(()=>sfx('hit',.5+i*.1),null,.7+i*.3)) },
    function(tl,r){ $$('.it',r.list).forEach((it,i)=>{ const at=i*.42; tl.fromTo(it,{opacity:0,x:-24},{opacity:1,x:0,duration:.5},at).call(()=>{ $('i',it).classList.add('on'); sfx('snap',1500+i*160) },null,at+.25) }) }
  ]});
