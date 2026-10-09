
/* ---------- __SID__ · pillars-roof (adapted from Velcure scene 7) ---------- */
const __P__D=__DATA__, __P__X=[450,960,1470];
def({id:'__SID__',chapter:__CHAPTER__,letterbox:__LETTERBOX__,mood:__MOOD__,
  html:()=>`${titleHTML(FD_ESC(__P__D.kicker),FD_ESC(__P__D.title))}
  <svg class="full" viewBox="0 0 1920 1080">
    <g data-r="ped"><polygon class="__C__-ped" points="190,380 1730,380 960,232"/><rect class="__C__-ent" x="190" y="380" width="1540" height="18"/><text class="__C__-pt" data-r="pt" x="960" y="350">${FD_ESC(__P__D.roofLabel)}</text></g>
    <g data-r="base"><rect class="__C__-st" x="200" y="880" width="1520" height="24"/><rect class="__C__-st" x="170" y="904" width="1580" height="22"/></g>
  </svg>
  ${__P__D.pillars.map((p,i)=>`<div class="__C__-pil" data-r="p${i}" style="left:${__P__X[i]-200}px;--c:${__P__D.toneVars[p.tone]}"><div class="n">PILLAR 0${i+1}</div><div class="h">${FD_ESC(p.heading)}</div><ul>${p.items.map(x=>`<li>${FD_ESC(x)}</li>`).join('')}</ul></div>`).join('')}`,
  init(r){ gsap.set([r.ped,r.base,r.p0,r.p1,r.p2],{opacity:0}) },
  enter(){ FX.release(); FX.set({mode:'drift',alpha:.2,trail:0,size:.85,speed:.5,mix:[1,.4,.3,0]}) },
  steps:[
    function(tl,r,s){ titleIn(tl,s,0); tl.fromTo(r.base,{opacity:0,y:30},{opacity:1,y:0,duration:.8},.3).call(()=>sfx('boom',.5),null,.4) },
    ...[0,1,2].map(i=>function(tl,r){ const p=r['p'+i];
      tl.fromTo(p,{clipPath:'inset(100% 0% 0% 0%)',opacity:1},{clipPath:'inset(0% 0% 0% 0%)',duration:1.1,ease:'power3.inOut'},0)
        .call(()=>sfx('riser',.9,.18),null,0).call(()=>{ sfx('boom',.8); shake(9); FX.burst(__P__X[i],880,5) },null,1.0)
        .fromTo($$('li',p),{opacity:0,x:-14},{opacity:1,x:0,duration:.5,stagger:.18},1.0) }),
    function(tl,r){ tl.fromTo(r.ped,{y:-560,opacity:1},{y:0,duration:.7,ease:'power4.in'},0).call(()=>{ sfx('boom',1.3); sfx('crack'); shake(24,.7); flash(.3); FX.burst(960,390,12) },null,.7)
        .fromTo(r.pt,{opacity:0},{opacity:1,duration:.8},.9) }
  ]});
