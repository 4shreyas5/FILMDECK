/* ---------- __SID__ · comparison (two-column layout language of Velcure scenes 2 and 4) ---------- */
const __P__D=__DATA__;
const __P__fs=d=>Math.max(60,Math.min(112,Math.floor(660/(Math.max(1,d.length)*0.56))));
const __P__side=(s,cls)=>`<div class="__C__-p ${cls}" data-r="p${cls}" style="--tone:${__P__D.toneVars[s.tone]}"><div class="h" data-r="h${cls}">${FD_ESC(s.heading)}</div>${s.metrics.map((m,i)=>`<div class="m" data-r="m${cls}${i}"><div class="k">${FD_ESC(m.label)}</div><div class="v" style="font-size:${__P__fs(m.value.display)}px">${FD_ESC(m.value.display)}</div></div>`).join('')}</div>`;
def({id:'__SID__',chapter:__CHAPTER__,letterbox:__LETTERBOX__,mood:__MOOD__,
  html:()=>`${titleHTML(FD_ESC(__P__D.kicker),FD_ESC(__P__D.title))}
  ${__P__side(__P__D.left,'L')}<div class="__C__-vs" data-r="vs">VS</div>${__P__side(__P__D.right,'R')}
  <div class="__C__-vd" data-r="vd">${FD_ESC(__P__D.verdict)}</div>`,
  init(r){ gsap.set([r.pL,r.pR,r.vs,r.vd],{opacity:0}) },
  enter(){ FX.release(); FX.set({mode:'drift',alpha:.22,trail:0,size:.85,speed:.6,mix:[1,.25,.2,.2]}) },
  steps:[
    function(tl,r,s){ titleIn(tl,s,0); tl.set(r.pL,{opacity:1},.3).fromTo(r.hL,{opacity:0,x:-40},{opacity:1,x:0,duration:.6},.4).call(()=>sfx('hit',.5),null,.4);
      __P__D.left.metrics.forEach((_,i)=>tl.fromTo(r['mL'+i],{opacity:0,y:30},{opacity:1,y:0,duration:.6,ease:'expo.out'},.8+i*.3).call(()=>sfx('tick',900,.1),null,.8+i*.3)) },
    function(tl,r){ tl.fromTo(r.vs,{opacity:0,scale:2,filter:'blur(12px)'},{opacity:1,scale:1,filter:'blur(0px)',duration:.45,ease:'expo.in'},0).call(()=>{ sfx('boom',.8); shake(8) },null,.4)
        .set(r.pR,{opacity:1},.5).fromTo(r.hR,{opacity:0,x:40},{opacity:1,x:0,duration:.6},.6);
      __P__D.right.metrics.forEach((_,i)=>tl.fromTo(r['mR'+i],{opacity:0,y:30},{opacity:1,y:0,duration:.6,ease:'expo.out'},1+i*.3).call(()=>sfx('tick',1300,.1),null,1+i*.3)) },
    function(tl,r){ tl.fromTo(r.vd,{opacity:0,y:24,filter:'blur(8px)'},{opacity:1,y:0,filter:'blur(0px)',duration:.9},0).call(()=>sfx('chime',392,.16),null,0) }
  ]});
