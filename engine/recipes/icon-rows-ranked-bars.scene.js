/* ---------- __SID__ · icon-rows-ranked-bars (adapted from Velcure scene 2 beats 4-5) ---------- */
const __P__D=__DATA__;
const __P__FIG=__P__D.icon==='person'?'<circle cy="-34" r="11"/><path d="M-20 18 C-20 -6 -12 -18 0 -18 C12 -18 20 -6 20 18Z"/>':'<rect x="-17" y="-30" width="34" height="48" rx="6"/>'; // person only when the counts are people
const __P__figs=(n,hollow,col)=>Array.from({length:n},(_,i)=>{ const h=i>=n-hollow; return `<svg class="fg" viewBox="-22 -50 44 70"><g style="${h?`fill:none;stroke:${col};stroke-width:2.5;stroke-dasharray:4 4`:`fill:${col}`}">${__P__FIG}</g></svg>` }).join('');
const __P__max=__P__D.ranked.items[0].value.hi;
def({id:'__SID__',chapter:__CHAPTER__,letterbox:__LETTERBOX__,mood:__MOOD__,
  html:()=>`${titleHTML(FD_ESC(__P__D.kicker),FD_ESC(__P__D.title))}
  <div class="__C__-a" data-r="a">
    ${__P__D.rows.map((row,i)=>{ const c=row.count, n=Math.round(c.hi), hollow=n-Math.round(c.lo), col=__P__D.toneVars[row.tone]; return `<div class="__C__-row" data-r="er${i}" style="top:${330+i*245}px"><div class="h"><b style="color:${col}">${FD_ESC(row.head)}</b>${FD_ESC(c.display+' '+row.text)}</div><div class="ic">${__P__figs(n,hollow,col)}</div></div>` }).join('')}
    ${__P__D.stamp?`<div class="__C__-x" data-r="x">${FD_ESC(__P__D.stamp)}</div>`:''}
  </div>
  <div class="__C__-f" data-r="f">
    <div class="__C__-fk" data-r="fk">${FD_ESC(__P__D.ranked.kicker)}</div>
    ${__P__D.ranked.items.map((it,i)=>`<div class="r" style="top:${360+i*190}px"><div class="lb" data-r="fl${i}">${FD_ESC(it.label)}</div><div class="tg" data-r="ft${i}">${FD_ESC(it.tag)}</div><div class="bar${i?' m':''}" data-r="fb${i}" style="width:${Math.max(60,Math.round(700*it.value.hi/__P__max))}px"></div><div class="vv" data-r="fv${i}" style="left:${640+Math.max(60,Math.round(700*it.value.hi/__P__max))+20}px">${FD_ESC(it.value.display)}</div></div>`).join('')}
    ${__P__D.ranked.note?`<div class="__C__-src" data-r="src">${FD_ESC(__P__D.ranked.note)}</div>`:''}
  </div>`,
  init(r){ gsap.set([r.er0,r.er1,r.x,r.f,r.fk,r.src,...__P__D.ranked.items.flatMap((_,i)=>[r['fl'+i],r['ft'+i],r['fv'+i]]),...$$('.fg',r.a)].filter(Boolean),{opacity:0});
    gsap.set(__P__D.ranked.items.map((_,i)=>r['fb'+i]),{scaleX:0,transformOrigin:'0% 50%'}); gsap.set(r.f,{opacity:1}) },
  enter(){ FX.release(); FX.set({mode:'drift',alpha:.22,trail:0,size:.85,speed:.6,mix:[1,.15,.3,.2]}) },
  steps:[
    function(tl,r,s){ titleIn(tl,s,0); const f=$$('.fg',r.er0); tl.to(r.er0,{opacity:1,duration:.4},.4).fromTo(f,{opacity:0,x:-30},{opacity:1,x:0,duration:.4,stagger:Math.min(.12,1.4/f.length)},.6);
      f.forEach((_,i)=>tl.call(()=>sfx('tick',900,.08),null,.6+i*Math.min(.12,1.4/f.length))) },
    function(tl,r){ const f=$$('.fg',r.er1), g=Math.min(.09,1.6/f.length); tl.to(r.er1,{opacity:1,duration:.4},0).fromTo(f,{opacity:0,x:-30},{opacity:1,x:0,duration:.35,stagger:g},.2);
      f.forEach((_,i)=>tl.call(()=>sfx('tick',1300,.08),null,.2+i*g));
      if(r.x) tl.fromTo(r.x,{opacity:0,scale:1.6},{opacity:1,scale:1,duration:.4,ease:'expo.in'},.4+f.length*g+.3).call(()=>{ sfx('boom',.8); shake(8) },null,.4+f.length*g+.7) },
    function(tl,r){ tl.to(r.a,{opacity:0,y:-40,duration:.6,ease:'power2.in'},0).call(()=>sfx('whoosh',.8,1),null,0).to(r.fk,{opacity:1,duration:.5},.5);
      __P__D.ranked.items.forEach((_,i)=>{ const at=.6+i*.7; tl.fromTo(r['fl'+i],{opacity:0,x:-40},{opacity:1,x:0,duration:.6},at).to(r['fb'+i],{scaleX:1,duration:1,ease:'expo.out'},at+.1).to(r['ft'+i],{opacity:1,duration:.4},at+.6).to(r['fv'+i],{opacity:1,duration:.4},at+.7).call(()=>sfx('hit',.8-i*.1),null,at+.15) });
      if(r.src) tl.to(r.src,{opacity:1,duration:.6},.6+__P__D.ranked.items.length*.7+.3) }
  ]});
