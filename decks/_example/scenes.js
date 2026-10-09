
/* ---------- 1. MINIMAL ---------- */
def({id:'s1',chapter:'HELLO',letterbox:false,mood:[1,500],
  html:()=>`${titleHTML('Scene 01 · Example','ONE IDEA PER SCENE.')}
    <div class="ex1-word" data-r="word">HELLO</div>`,
  init(r){ gsap.set(r.word,{opacity:0}) },
  enter(){ FX.release(); FX.set({mode:'drift',alpha:.22,trail:0,size:.85,speed:.6,mix:[1,.2,.3,0]}) },
  steps:[
    function(tl,r,s){ titleIn(tl,s,0) },
    function(tl,r){
      tl.fromTo(r.word,{opacity:0,scale:2.4,filter:'blur(24px)'},{opacity:1,scale:1,filter:'blur(0px)',duration:.42,ease:'expo.in'},0)
        .call(()=>{ sfx('boom',1); shake(14); flash(.2) },null,.42) }
  ]});

/* ---------- 2. COMPLETE ---------- */
// Content that a storyboard would supply. Geometry is derived from it with one linear scale.
const EX2_DATA=[{k:'BEFORE',v:4,show:'4 PER MONTH'},{k:'NOW',v:11,show:'11 PER MONTH'}], EX2_MAX=12, EX2_X0=420, EX2_W=1000, EX2_Y=[420,560], EX2_H=70;
const ex2x=v=>EX2_X0+v/EX2_MAX*EX2_W;
def({id:'s2',chapter:'EXAMPLE DATA',mood:[1,600],
  html:()=>`${titleHTML('Scene 02 · Example','A CHART DRAWN TO SCALE.')}
    <svg class="full" viewBox="0 0 1920 1080">
      <line class="ex2-axis" x1="${EX2_X0}" y1="380" x2="${EX2_X0}" y2="680"/>
      ${EX2_DATA.map((d,i)=>`<text class="ex2-lab" x="${EX2_X0-24}" y="${EX2_Y[i]+EX2_H/2+12}" text-anchor="end">${d.k}</text>
        <rect class="ex2-bar${i?' hot':''}" data-r="bar${i}" x="${EX2_X0}" y="${EX2_Y[i]}" width="${ex2x(d.v)-EX2_X0}" height="${EX2_H}"/>
        <text class="ex2-val" data-r="val${i}" x="${ex2x(d.v)+20}" y="${EX2_Y[i]+EX2_H/2+8}">${d.show}</text>`).join('')}
    </svg>
    <canvas class="full" data-r="cv"></canvas>
    <div class="ex2-cap" data-r="cap">More than double.</div>`,
  init(r,s){ s.ctx=hc(r.cv); s.st={fill:0};
    EX2_DATA.forEach((d,i)=>{ gsap.set(r['bar'+i],{scaleX:0,svgOrigin:`${EX2_X0} ${EX2_Y[i]}`}); gsap.set(r['val'+i],{opacity:0}) }); gsap.set(r.cap,{opacity:0}) },
  enter(){ FX.release(); FX.set({mode:'drift',alpha:.2,trail:0,size:.85,speed:.6,mix:[1,.3,.3,.1]}) },
  frame(t,dt,r,s){ const c=s.ctx; if(!c) return; c.clearRect(0,0,W,H);
    const f=s.st.fill; if(f<=0) return;
    c.strokeStyle=`rgba(242,162,71,${.35+.25*Math.sin(t*3)})`; c.lineWidth=3; c.beginPath(); c.arc(1600,820,100*f,0,6.283); c.stroke() },
  steps:[
    function(tl,r,s){ titleIn(tl,s,0) },
    function(tl,r){ EX2_DATA.forEach((d,i)=>tl.to(r['bar'+i],{scaleX:1,svgOrigin:`${EX2_X0} ${EX2_Y[i]}`,duration:1,ease:'expo.out'},i*.4).to(r['val'+i],{opacity:1,duration:.5},.6+i*.4).call(()=>sfx('hit',.5),null,.2+i*.4)) },
    function(tl,r,s){ tl.to(s.st,{fill:1,duration:.8,ease:'back.out(2)'},0).call(()=>{ sfx('boom',.8); shake(8); loop(s,gsap.to(s.st,{fill:.9,duration:1.2,yoyo:true,repeat:-1,ease:'sine.inOut',delay:.8})) },null,.4)
        .fromTo(r.cap,{opacity:0,y:30,filter:'blur(8px)'},{opacity:1,y:0,filter:'blur(0px)',duration:.9},.5).call(()=>sfx('chime',392,.14),null,.5) },
    function(tl,r){ tl.call(()=>{ FX.set({alphaT:.95,size:1.15,k:.07,damp:.8,jitter:.6,mix:[1,.2,0,0]}); FX.targets(FX.textPoints('DOUBLED',960,300,160,{gap:5})); sfx('riser',1,.3) },null,0) }
  ]});
