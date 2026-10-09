const FIG='<circle cy="-34" r="11"/><path d="M-20 18 C-20 -6 -12 -18 0 -18 C12 -18 20 -6 20 18Z"/>';
const NAMES=['Sheenam Dhingra','Shevya Agarwal','Shivangi Mathur','Shivansh Rawat','Shivek Choudhary','Shourya Jain','Shreyas Singh','Shruti Kumari','Shubha Vardhan Thota'];

/* ---------- 1. OPENING ---------- */
const V1={cols:15,rows:7,x0:330,y0:300,dx:78,dy:84};
def({id:'s1',chapter:'VELCURE LUBRICANTS',letterbox:true,mood:[.6,260],
  html:()=>`<canvas class="full" data-r="cv"></canvas>
  <div class="v1-kick" data-r="kick">VELCURE LUBRICANTS</div>
  <div class="v1-count" data-r="cnt"><span>EXITS IN A SINGLE MONTH</span><b data-r="num">0</b></div>
  <div class="v1-t" data-r="t"><div class="a" data-r="ta">INCREASING</div><div class="b" data-r="tb">ATTRITION RATE</div><div class="c" data-r="tc">at Velcure Lubricants</div></div>
  <div class="v1-crk" data-r="crk">HRM CASE STUDY · GROUP 7</div>
  <div class="v1-cr" data-r="cr">${NAMES.map(n=>`<span>${n}</span>`).join('')}</div>`,
  init(r,s){ s.ctx=hc(r.cv); const ps=[]; for(let j=0;j<V1.rows;j++) for(let i=0;i<V1.cols;i++) ps.push({x:V1.x0+i*V1.dx,y:V1.y0+j*V1.dy,a:0,red:0,leave:false,vx:0,d:i+j});
    s.st={ps,dim:0}; [r.ta,r.tb,r.tc].forEach(splitChars); gsap.set($$('.ch',r.t),{opacity:0}); gsap.set($$('span',r.cr),{opacity:0}); gsap.set([r.crk,r.cnt,r.kick],{opacity:0}) },
  enter(){ FX.release(); FX.set({mode:'drift',alpha:.2,alphaT:.95,trail:0,size:.8,speed:.5,gain:1,mix:[1,.08,0,.05]}) },
  frame(t,dt,r,s){ const c=s.ctx; if(!c) return; c.clearRect(0,0,W,H); const dm=1-s.st.dim*.88; dt=Math.min(dt,.05);
    for(const p of s.st.ps){ if(p.a<=.01) continue;
      if(p.leave){ p.vx+=2600*dt; p.x+=p.vx*dt; if(p.x>W+80){ p.a=0; continue }
        const tl=Math.max(1,Math.min(280,p.vx*.12)); const g=c.createLinearGradient(p.x-tl,0,p.x,0); g.addColorStop(0,'rgba(229,84,75,0)'); g.addColorStop(1,`rgba(229,84,75,${(.6*p.a*dm).toFixed(3)})`);
        c.strokeStyle=g; c.lineWidth=16; c.lineCap='butt'; c.beginPath(); c.moveTo(p.x-tl,p.y); c.lineTo(p.x,p.y); c.stroke() }
      const k=p.red; c.fillStyle=`rgba(${Math.round(lerp(238,229,k))},${Math.round(lerp(233,84,k))},${Math.round(lerp(224,75,k))},${(p.a*dm*lerp(.7,1,k)).toFixed(3)})`;
      c.beginPath(); c.arc(p.x,p.y-20,9,0,6.283); c.fill(); c.beginPath(); c.arc(p.x,p.y+16,17,Math.PI,0); c.closePath(); c.fill() } },
  steps:[
    function(tl,r,s){ tl.to(r.kick,{opacity:1,duration:1.2},0).call(()=>sfx('riser',1.2,.22),null,0);
      s.st.ps.forEach(p=>tl.to(p,{a:1,duration:.6,ease:'power2.out'},.2+p.d*.045));
      tl.call(()=>{ sfx('boom',.7); FX.burst(870,550,3) },null,1.2) },
    function(tl,r,s){ const ps=s.st.ps, idx=[]; while(idx.length<12){ const i=Math.floor(Math.random()*ps.length); if(!idx.includes(i)) idx.push(i) }
      tl.to(r.cnt,{opacity:1,duration:.5},0);
      let at=.3; idx.forEach((i,k)=>{ const p=ps[i]; tl.to(p,{red:1,duration:.18},at).call(()=>{ p.leave=true; r.num.textContent=k+1; sfx('whoosh',.3,1); sfx('tick',700+k*90,.09) },null,at+.22); at+=Math.max(.1,.42-k*.03) });
      tl.call(()=>{ sfx('boom',.8); shake(8) },null,at+.3) },
    function(tl,r,s){ tl.to(s.st,{dim:1,duration:.9},0).to([r.kick,r.cnt],{opacity:0,duration:.5},0)
        .fromTo($$('.ch',r.ta),{opacity:0,y:-30},{opacity:1,y:0,duration:.6,stagger:.04},.3)
        .fromTo($$('.ch',r.tb),{opacity:0,scale:2.2,filter:'blur(18px)'},{opacity:1,scale:1,filter:'blur(0px)',duration:.7,stagger:.035,ease:'expo.out'},.6)
        .call(()=>{ sfx('boom',1); flash(.18); shake(10) },null,.7)
        .fromTo($$('.ch',r.tc),{opacity:0,filter:'blur(8px)'},{opacity:1,filter:'blur(0px)',duration:.8,stagger:.02},1.3) },
    function(tl,r){ tl.fromTo(r.crk,{opacity:0,letterSpacing:'0.9em'},{opacity:1,letterSpacing:'0.42em',duration:1},0).call(()=>sfx('hit',.5),null,0)
        .fromTo($$('span',r.cr),{opacity:0,y:16},{opacity:1,y:0,duration:.6,stagger:.08},.3) }
  ]});

/* ---------- 2. THE PROBLEM ---------- */
const G2={cx:520,cy:640,R:270};
const gpt=(v,rr)=>{ const th=Math.PI+v/15*Math.PI; return [G2.cx+rr*Math.cos(th),G2.cy+rr*Math.sin(th)] };
const garc=(a,b,rr)=>{ const p=gpt(a,rr),q=gpt(b,rr); return `M${p[0].toFixed(1)} ${p[1].toFixed(1)} A${rr} ${rr} 0 0 1 ${q[0].toFixed(1)} ${q[1].toFixed(1)}` };
const figs=(n,hollow,col)=>Array.from({length:n},(_,i)=>{ const h=i>=n-hollow; return `<svg class="fg" viewBox="-22 -50 44 70"><g style="${h?`fill:none;stroke:${col};stroke-width:2.5;stroke-dasharray:4 4`:`fill:${col}`}">${FIG}</g></svg>` }).join('');
def({id:'s2',chapter:'THE PROBLEM',mood:[1,520],
  html:()=>{ let ticks=''; for(let v=0;v<=15;v++){ const mj=v%5===0, a=gpt(v,G2.R+16), b=gpt(v,G2.R+(mj?42:28)); ticks+=`<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" class="v2-tk${mj?' mj':''}"/>`; if(mj){ const l=gpt(v,G2.R+74); ticks+=`<text class="v2-tl" x="${l[0].toFixed(1)}" y="${(l[1]+6).toFixed(1)}">${v}%</text>` } }
    return `${titleHTML('Scene 02 · The problem','THE PROBLEM: AN ATTRITION SPIKE.')}
    <div class="v2-a" data-r="a">
      <svg class="full" viewBox="0 0 1920 1080">
        <path class="v2-trk" data-r="trk" pathLength="1" d="${garc(0,15,G2.R)}"/>
        <g data-r="tks" opacity="0">${ticks}</g>
        <path class="v2-band" data-r="bb" pathLength="1" d="${garc(7,8,G2.R)}"/>
        <path class="v2-band hot" data-r="bh" pathLength="1" d="${garc(9.6,10.4,G2.R)}"/>
        <g data-r="ndl" opacity="0"><line class="v2-nd" x1="${G2.cx}" y1="${G2.cy}" x2="${G2.cx-G2.R+40}" y2="${G2.cy}"/><circle cx="${G2.cx}" cy="${G2.cy}" r="16" fill="#EEE9E0"/></g>
      </svg>
      <div class="v2-read" data-r="rd"><div class="l" data-r="rl">ATTRITION RATE · BEFORE</div><div class="n" data-r="rn">0%</div></div>
      <div class="v2-row" data-r="er1" style="top:330px"><div class="h"><b>BEFORE</b>4–5 exits a month</div><div class="ic">${figs(5,1,'#EEE9E0')}</div></div>
      <div class="v2-row" data-r="er2" style="top:575px"><div class="h"><b class="hot">NOW</b>10–12 exits a month</div><div class="ic">${figs(12,2,'#E5544B')}</div></div>
      <div class="v2-x" data-r="x">MORE THAN DOUBLED</div>
    </div>
    <div class="v2-f" data-r="f">
      <div class="v2-fk" data-r="fk">FUNCTIONS IMPACTED</div>
      <div class="v2-fr" style="top:360px"><div class="lb" data-r="fl1">SALES</div><div class="tg" data-r="ft1">#1 · HIGHEST EXITS</div><div class="bar" data-r="fb1"></div></div>
      <div class="v2-fr" style="top:560px"><div class="lb" data-r="fl2">MANUFACTURING</div><div class="tg" data-r="ft2">#2 · SECOND HIGHEST</div><div class="bar m" data-r="fb2"></div></div>
      <div class="v2-src" data-r="src">Concise metrics, taken from recent exit summaries.</div>
    </div>` },
  init(r){ gsap.set(r.ndl,{rotation:0,svgOrigin:`${G2.cx} ${G2.cy}`}); gsap.set(r.rd,{xPercent:-50});
    gsap.set([r.rd,r.er1,r.er2,r.x,r.fk,r.fl1,r.fl2,r.ft1,r.ft2,r.src,...$$('.fg',r.a)],{opacity:0}); gsap.set([r.fb1,r.fb2],{scaleX:0,transformOrigin:'0% 50%'}) },
  enter(){ FX.release(); FX.set({mode:'drift',alpha:.22,trail:0,size:.85,speed:.6,mix:[1,.15,.3,.2]}) },
  steps:[
    function(tl,r,s){ titleIn(tl,s,0); tl.to(r.trk,{strokeDashoffset:0,duration:1.2,ease:'power2.inOut'},.3).to(r.tks,{opacity:1,duration:.8},.8).to(r.ndl,{opacity:1,duration:.5},1.0).call(()=>sfx('riser',1,.15),null,.3) },
    function(tl,r){ const o={v:0};
      tl.to(r.rd,{opacity:1,duration:.5},0)
        .to(r.ndl,{rotation:7.5*12,svgOrigin:`${G2.cx} ${G2.cy}`,duration:1.4,ease:'power3.out'},0)
        .to(o,{v:7.5,duration:1.4,ease:'power3.out',onUpdate(){ r.rn.textContent=Math.floor(o.v)+'%' },onComplete(){ r.rn.textContent='7–8%' }},0)
        .to(r.bb,{strokeDashoffset:0,duration:.6},.9).call(()=>{ sfx('hit',.5); sfx('blip',520) },null,1.0) },
    function(tl,r){ const o={v:8};
      tl.to(r.bb,{opacity:.35,duration:.4},0)
        .to(r.ndl,{rotation:10*12,svgOrigin:`${G2.cx} ${G2.cy}`,duration:1.2,ease:'elastic.out(1.1,.35)'},.15)
        .to(o,{v:10,duration:.6,onUpdate(){ r.rn.textContent=Math.round(o.v)+'%' },onComplete(){ r.rn.textContent='~10%' }},.15)
        .call(()=>{ r.rl.textContent='ATTRITION RATE · NOW'; r.rn.style.color='var(--alarm)'; sfx('boom',1); sfx('glitch'); shake(14); flash(.15) },null,.2)
        .to(r.bh,{strokeDashoffset:0,duration:.5},.3) },
    function(tl,r){ const f1=$$('.fg',r.er1), f2=$$('.fg',r.er2);
      tl.to(r.er1,{opacity:1,duration:.4},0).fromTo(f1,{opacity:0,x:-30},{opacity:1,x:0,duration:.4,stagger:.12},.2);
      f1.forEach((_,i)=>tl.call(()=>sfx('tick',900,.08),null,.2+i*.12));
      tl.to(r.er2,{opacity:1,duration:.4},1.1).fromTo(f2,{opacity:0,x:-30},{opacity:1,x:0,duration:.35,stagger:.07},1.3);
      f2.forEach((_,i)=>tl.call(()=>sfx('tick',1300,.08),null,1.3+i*.07));
      tl.fromTo(r.x,{opacity:0,scale:1.6},{opacity:1,scale:1,duration:.4,ease:'expo.in'},2.4).call(()=>{ sfx('boom',.8); shake(8) },null,2.8) },
    function(tl,r){ tl.to(r.a,{opacity:0,y:-40,duration:.6,ease:'power2.in'},0).call(()=>sfx('whoosh',.8,1),null,0)
        .to(r.fk,{opacity:1,duration:.5},.5)
        .fromTo(r.fl1,{opacity:0,x:-40},{opacity:1,x:0,duration:.6},.6).to(r.fb1,{scaleX:1,duration:1,ease:'expo.out'},.7).to(r.ft1,{opacity:1,duration:.4},1.2).call(()=>sfx('hit',.8),null,.75)
        .fromTo(r.fl2,{opacity:0,x:-40},{opacity:1,x:0,duration:.6},1.3).to(r.fb2,{scaleX:1,duration:1,ease:'expo.out'},1.4).to(r.ft2,{opacity:1,duration:.4},1.9).call(()=>sfx('hit',.6),null,1.45)
        .to(r.src,{opacity:1,duration:.6},2.3) }
  ]});

/* ---------- 3. WHY THEY LEAVE ---------- */
const X3=v=>620+v*18.5;
const R3=[{k:'SWITCH TO A COMPETITOR',lo:35,hi:60,y:350,h:70,c:'#E5544B'},{k:'STAY · EXCEPTIONAL RAISE',lo:15,hi:20,y:478,h:46,c:'#F2A247'},{k:'STAY · TYPICAL RAISE',lo:8,hi:10,y:540,h:46,c:'#F2A247'}];
def({id:'s3',chapter:'WHY THEY LEAVE',mood:[1,600],
  html:()=>{ let grid=''; for(let v=0;v<=60;v+=10) grid+=`<line x1="${X3(v)}" y1="320" x2="${X3(v)}" y2="630" class="v3-gl"/><text class="v3-tl" x="${X3(v)}" y="662">${v}%</text>`;
    const bars=R3.map((b,i)=>`<text class="v3-rl" data-r="rl${i}" x="590" y="${b.y+b.h/2+10}">${b.k}</text>
      <g data-r="bar${i}"><rect x="${X3(0)}" y="${b.y}" width="${X3(b.lo)-X3(0)}" height="${b.h}" fill="${b.c}"/><rect x="${X3(b.lo)}" y="${b.y}" width="${X3(b.hi)-X3(b.lo)}" height="${b.h}" fill="${b.c}" fill-opacity=".35" stroke="${b.c}" stroke-dasharray="6 5"/></g>
      <text class="v3-vl" data-r="vl${i}" x="${X3(b.hi)+18}" y="${b.y+b.h/2+14}" fill="${b.c}">${b.lo}–${b.hi}%</text>`).join('');
    return `${titleHTML('Scene 03 · The cause','WHY ARE EMPLOYEES LEAVING?')}
    <div class="v3-a" data-r="a">
      <svg class="full" viewBox="0 0 1920 1080">
        <g data-r="ax" opacity="0">${grid}<line x1="${X3(0)}" y1="630" x2="${X3(60)}" y2="630" class="v3-ax"/><text class="v3-at" x="${X3(60)}" y="704">PAY INCREASE ON THE TABLE</text></g>
        <text class="v3-an" data-r="an1" x="${X3(0)}" y="334">01 · COMPENSATION GAP</text>
        <text class="v3-an" data-r="an2" x="${X3(0)}" y="612">02 · CONSERVATIVE INCREMENTS</text>
        ${bars}
        <g data-r="gap" opacity="0"><line x1="${X3(20)}" y1="330" x2="${X3(20)}" y2="596" class="v3-gd"/><line x1="${X3(35)}" y1="330" x2="${X3(35)}" y2="596" class="v3-gd"/>
          <path class="v3-gb" d="M${X3(20)+4} 440 H${X3(35)-4} M${X3(20)+14} 432 L${X3(20)+4} 440 L${X3(20)+14} 448 M${X3(35)-14} 432 L${X3(35)-4} 440 L${X3(35)-14} 448"/>
          <text class="v3-gt" x="${(X3(20)+X3(35))/2}" y="467">GAP OF 15+ POINTS</text></g>
      </svg>
      <div class="v3-cd" data-r="c1" style="left:300px"><div class="h">03 · HIGH MARKET DEMAND</div><div class="p">Sales and Manufacturing skills are in active demand.</div></div>
      <div class="v3-cd" data-r="c2" style="left:1010px"><div class="h">04 · ECONOMIC PULL</div><div class="p">Higher market pay, low switching friction.</div></div>
    </div>
    <div class="v3-v"><div class="k" data-r="vk">THE PRIMARY ISSUE</div><div class="b" data-r="vb">COMPENSATION</div><div class="s" data-r="vs">Pay competitiveness. Not culture.</div></div>` },
  init(r){ R3.forEach((b,i)=>{ gsap.set(r['bar'+i],{scaleX:0,svgOrigin:`${X3(0)} ${b.y}`}); gsap.set([r['rl'+i],r['vl'+i]],{opacity:0}) }); gsap.set([r.an1,r.an2,r.c1,r.c2,r.vk,r.vb,r.vs],{opacity:0}) },
  enter(){ FX.release(); FX.set({mode:'drift',alpha:.2,trail:0,size:.85,speed:.6,mix:[1,.2,.3,.15]}) },
  steps:[
    function(tl,r,s){ titleIn(tl,s,0); tl.to(r.ax,{opacity:1,duration:.8},.4) },
    function(tl,r){ tl.to(r.an1,{opacity:1,duration:.4},0).to(r.rl0,{opacity:1,duration:.5},.1).to(r.bar0,{scaleX:1,svgOrigin:`${X3(0)} ${R3[0].y}`,duration:1.3,ease:'expo.out'},.2)
        .call(()=>sfx('riser',.5,.2),null,0).call(()=>{ sfx('boom',.9); shake(8) },null,.5).fromTo(r.vl0,{opacity:0,x:-20},{opacity:1,x:0,duration:.5},1.1) },
    function(tl,r){ tl.to(r.an2,{opacity:1,duration:.4},0);
      [1,2].forEach((i,k)=>tl.to(r['rl'+i],{opacity:1,duration:.4},.1+k*.35).to(r['bar'+i],{scaleX:1,svgOrigin:`${X3(0)} ${R3[i].y}`,duration:.9,ease:'expo.out'},.15+k*.35).to(r['vl'+i],{opacity:1,duration:.4},.6+k*.35).call(()=>sfx('hit',.4),null,.2+k*.35));
      tl.to(r.gap,{opacity:1,duration:.6},1.3).call(()=>{ sfx('glitch'); sfx('blip',330) },null,1.3) },
    function(tl,r){ tl.fromTo(r.c1,{opacity:0,y:30},{opacity:1,y:0,duration:.7},0).fromTo(r.c2,{opacity:0,y:30},{opacity:1,y:0,duration:.7},.35)
        .call(()=>{ FX.set({mode:'flow',sy:860,alpha:.45,mix:[.6,.4,.2,1]}); sfx('whoosh',1.4,1) },null,.2) },
    function(tl,r){ tl.to(r.a,{opacity:.07,filter:'blur(4px)',duration:.7},0).call(()=>FX.set({mode:'drift',alpha:.25}),null,0)
        .to(r.vk,{opacity:1,duration:.5},.4).fromTo(r.vb,{opacity:0,scale:1.8,filter:'blur(20px)'},{opacity:1,scale:1,filter:'blur(0px)',duration:.45,ease:'expo.in'},.5).call(()=>{ sfx('boom',1.1); shake(16); flash(.2) },null,.95)
        .fromTo(r.vs,{opacity:0,y:20},{opacity:1,y:0,duration:.8},1.3) }
  ]});

/* ---------- 4. MATCH THE MARKET? ---------- */
const G4={cols:10,rows:6,x0:220,y0:420,dx:64,dy:78}, M4={x:1290,w:170,base:830,budget:300,cur:210}, PICK4=[3,11,16,24,28,35,41,47,52];
def({id:'s4',chapter:'MATCH THE MARKET?',mood:[1,600],
  html:()=>{ let f=''; for(let j=0;j<G4.rows;j++) for(let i=0;i<G4.cols;i++){ const k=j*G4.cols+i; f+=`<g transform="translate(${G4.x0+i*G4.dx} ${G4.y0+j*G4.dy}) scale(.78)">${PICK4.includes(k)?`<circle class="v4-rg" data-r="g${k}" cy="-12" r="40"/>`:''}<g class="v4-f" data-r="f${k}">${FIG}</g></g>` }
    const M=M4, top=M.base-470;
    return `${titleHTML('Scene 04 · The response','SHOULD VELCURE MATCH COMPETITOR SALARIES?')}
    <div class="v4-no"><div class="b" data-r="nb">NO.</div><div class="s" data-r="ns">Not universally.</div></div>
    <div class="v4-a" data-r="a">
      <div class="v4-chip" data-r="hd">BLANKET 35–60% RAISE FOR EVERYONE</div>
      <svg class="full" viewBox="0 0 1920 1080">
        <g data-r="grid">${f}</g>
        <line data-r="scan" x1="180" y1="370" x2="180" y2="850" class="v4-scan" opacity="0"/>
        <text class="v4-mt" x="${M.x}" y="${top-24}">PAYROLL COST</text>
        <rect x="${M.x}" y="${top}" width="${M.w}" height="470" class="v4-fr"/>
        <rect data-r="bar" x="${M.x}" y="${M.base}" width="${M.w}" height="0" style="fill:#7E8594"/>
        <line x1="${M.x-50}" y1="${M.base-M.budget}" x2="${M.x+M.w+50}" y2="${M.base-M.budget}" class="v4-bud"/>
        <text class="v4-bt" x="${M.x+M.w+66}" y="${M.base-M.budget+6}">SUSTAINABLE BUDGET</text>
      </svg>
      <div class="v4-tag" data-r="t1" style="left:220px">INTERNAL INEQUITY</div>
      <div class="v4-tag" data-r="t2" style="left:1290px">UNSUSTAINABLE COST</div>
      <div class="v4-lev" data-r="lev"><span>RETENTION BONUSES</span><span>SKILL-BASED PAY</span><span>SHORT-TERM INCENTIVES</span></div>
    </div>
    <div class="v4-goal" data-r="goal"><div class="k" data-r="gk">THE GOAL</div><div class="l1" data-r="g1">Stop the flight of critical talent</div><div class="l2" data-r="g2">without triggering salary inflation.</div></div>` },
  init(r){ gsap.set([r.nb,r.ns,r.a,r.t1,r.t2,...$$('span',r.lev),r.gk,r.g1,r.g2,...$$('.v4-rg',r.a)],{opacity:0}) },
  enter(){ FX.release(); FX.set({mode:'drift',alpha:.2,trail:0,size:.85,speed:.6,mix:[1,.25,.3,.1]}) },
  steps:[
    function(tl,r,s){ titleIn(tl,s,0) },
    function(tl,r){ tl.fromTo(r.nb,{opacity:0,scale:2.6,filter:'blur(26px)'},{opacity:1,scale:1,filter:'blur(0px)',duration:.42,ease:'expo.in'},0).call(()=>{ sfx('boom',1.2); shake(20); flash(.25) },null,.42)
        .fromTo(r.ns,{opacity:0,y:20},{opacity:1,y:0,duration:.8},.9).call(()=>sfx('chime',220,.12),null,.9) },
    function(tl,r){ const fs=$$('.v4-f',r.a);
      tl.to([r.nb,r.ns],{opacity:0,y:-30,duration:.5,ease:'power2.in'},0).to(r.a,{opacity:1,duration:.6},.3)
        .fromTo(fs,{opacity:0},{opacity:1,duration:.3,stagger:.01},.4)
        .to(r.bar,{attr:{y:M4.base-M4.cur,height:M4.cur},duration:.8},.6)
        .call(()=>sfx('riser',1.4,.35),null,1.2)
        .to(fs,{fill:'#E5544B',duration:.25,stagger:{each:.008,from:'random'}},1.3)
        .to(r.bar,{attr:{y:M4.base-530,height:530},fill:'#E5544B',duration:1.4,ease:'power2.in'},1.3)
        .call(()=>{ sfx('boom',1.1); sfx('crack'); shake(18); flash(.3) },null,2.7)
        .to(r.bar,{attr:{y:M4.base-512,height:512},duration:.1,repeat:5,yoyo:true},2.7)
        .fromTo(r.t1,{opacity:0,y:16},{opacity:1,y:0,duration:.5},2.9).fromTo(r.t2,{opacity:0,y:16},{opacity:1,y:0,duration:.5},3.05) },
    function(tl,r){ const fs=$$('.v4-f',r.a);
      tl.to([r.t1,r.t2],{opacity:0,duration:.4},0).to(fs,{fill:'#5d6372',duration:.4},0)
        .to(r.bar,{attr:{y:M4.base-M4.cur,height:M4.cur},fill:'#7E8594',duration:.7,ease:'power3.inOut'},0)
        .call(()=>{ r.hd.textContent='TARGETED CORRECTIONS · CRITICAL ROLES & HIGH PERFORMERS'; r.hd.classList.add('on'); sfx('whoosh',.6,-1) },null,.3)
        .fromTo(r.scan,{attr:{x1:180,x2:180},opacity:1},{attr:{x1:830,x2:830},duration:1.3,ease:'power1.inOut'},.6).to(r.scan,{opacity:0,duration:.3},1.9);
      PICK4.forEach((k,i)=>{ const col=k%G4.cols, at=.6+(col/(G4.cols-1))*1.3;
        tl.to(r['f'+k],{fill:'#F2A247',duration:.2},at).fromTo(r['g'+k],{opacity:0,scale:2,transformOrigin:'50% 50%'},{opacity:1,scale:1,duration:.4,ease:'back.out(2)'},at).call(()=>sfx('blip',700+i*60,.1),null,at) });
      tl.to(r.bar,{attr:{y:M4.base-262,height:262},fill:'#F2A247',duration:.9,ease:'power2.out'},2.0).call(()=>sfx('chime',392,.16),null,2.2) },
    function(tl,r){ tl.fromTo($$('span',r.lev),{opacity:0,y:20},{opacity:1,y:0,duration:.5,stagger:.18},0); [0,1,2].forEach(i=>tl.call(()=>sfx('hit',.4),null,i*.18)) },
    function(tl,r){ tl.to(r.a,{opacity:.08,filter:'blur(4px)',duration:.7},0).to(r.gk,{opacity:1,duration:.5},.4)
        .fromTo(r.g1,{opacity:0,y:20},{opacity:1,y:0,duration:.9},.5).fromTo(r.g2,{opacity:0,y:20},{opacity:1,y:0,duration:.9},1.2).call(()=>sfx('chime',293.66,.14),null,.5).call(()=>sfx('chime',440,.14),null,1.2) }
  ]});

/* ---------- 5. CULTURE ---------- */
const C5=[400,960,1520];
const starPts=(R,r,n)=>Array.from({length:n*2},(_,i)=>{ const a=-Math.PI/2+i*Math.PI/n, rr=i%2?r:R; return `${(Math.cos(a)*rr).toFixed(1)},${(Math.sin(a)*rr).toFixed(1)}` }).join(' ');
const EMB5=[
  `<circle class="e-ln" pathLength="1" cx="-110" cy="0" r="46"/><text class="e-tx" x="-110" y="5">VELCURE</text><path class="e-dr" pathLength="1" d="M-66 -14 C 0 -112, 160 -104, 160 0 C 160 104, 0 112, -66 14"/><circle class="e-dot" r="11"/>`,
  `<path class="e-dr" pathLength="1" d="M-165 105 H-105 V55 H-45 V5 H15 V-45 H75 V-95 H165"/><circle class="e-dot" r="11"/>`,
  `<g class="e-rays">${Array.from({length:12},(_,i)=>{ const a=i*Math.PI/6, c=Math.cos(a), s=Math.sin(a); return `<line x1="${(c*100).toFixed(1)}" y1="${(s*100).toFixed(1)}" x2="${(c*128).toFixed(1)}" y2="${(s*128).toFixed(1)}"/>` }).join('')}</g><polygon class="e-star" pathLength="1" points="${starPts(78,34,5)}"/>`];
def({id:'s5',chapter:'CULTURE',mood:[1,700],
  html:()=>`${titleHTML('Scene 05 · The other lever','CAN CULTURE RETAIN EMPLOYEES?')}
  ${[0,1,2].map(i=>`<div class="v5-col" data-r="c${i}" style="left:${C5[i]-230}px"><svg class="v5-em" viewBox="-180 -130 360 260">${EMB5[i]}</svg>
    <div class="h">${['BELONGING','DEVELOPMENT &amp; MENTORING','RECOGNITION'][i]}</div>
    <div class="p">${['Strong relationships. Boomerang hires come back.','Career paths and learning raise the stay rate.','Visible appreciation offsets pay gaps.'][i]}</div></div>`).join('')}
  <div class="v5-ev" data-r="ev"><span class="k">EVIDENCE</span>Returning employees show that <em>culture matters.</em></div>`,
  init(r,s){ gsap.set([r.c0,r.c1,r.c2,r.ev],{opacity:0}); s.st={on:[0,0,0],p:[0,.25],paths:[$('.e-dr',r.c0),$('.e-dr',r.c1)],dots:[$('.e-dot',r.c0),$('.e-dot',r.c1)],rays:$('.e-rays',r.c2)}; gsap.set(s.st.rays,{opacity:0}) },
  enter(){ FX.release(); FX.set({mode:'drift',alpha:.22,trail:0,size:.85,speed:.6,mix:[1,.4,.4,0]}) },
  frame(t,dt,r,s){ const st=s.st; if(!st.paths) return; dt=Math.min(dt,.05);
    [0,1].forEach(i=>{ if(!st.on[i]) return; const P=st.paths[i], D=st.dots[i]; st.p[i]=(st.p[i]+dt*(i?.26:.36))%1; const pt=P.getPointAtLength(st.p[i]*P.getTotalLength());
      D.setAttribute('cx',pt.x.toFixed(1)); D.setAttribute('cy',pt.y.toFixed(1)); D.style.opacity=clamp(Math.sin(st.p[i]*Math.PI)*4).toFixed(2) });
    if(st.on[2]) st.rays.setAttribute('transform',`rotate(${(t*8%360).toFixed(1)}) scale(${(1+Math.sin(t*3)*.08).toFixed(3)})`) },
  steps:[
    function(tl,r,s){ titleIn(tl,s,0) },
    ...[0,1,2].map(i=>function(tl,r,s){ const c=r['c'+i];
      tl.to(c,{opacity:1,duration:.4},0).to($$('.e-dr,.e-ln,.e-star',c),{strokeDashoffset:0,duration:1.1,stagger:.2,ease:'power2.inOut'},.1)
        .fromTo($('.h',c),{opacity:0,y:24},{opacity:1,y:0,duration:.6},.5).fromTo($('.p',c),{opacity:0},{opacity:1,duration:.7},.8)
        .call(()=>{ sfx('chime',[261.63,329.63,392][i],.16); sfx('hit',.4) },null,.2).call(()=>{ s.st.on[i]=1 },null,1.0);
      if(i===2) tl.to(s.st.rays,{opacity:1,duration:.5},.8).call(()=>{ FX.burst(C5[2],430,5); sfx('boom',.6) },null,.9) }),
    function(tl,r){ tl.fromTo(r.ev,{opacity:0,y:20},{opacity:1,y:0,duration:.9},0).call(()=>sfx('chime',523.25,.16),null,0) }
  ]});

/* ---------- 6. RETENTION VS RECRUITMENT ---------- */
const T6={x0:830,x1:1090,top:330,bot:860,floor:892};
const col6=(side,h,tag,items,sub,chips)=>`<div class="v6-col ${side}" data-r="${side.toUpperCase()}"><div class="hd"><b>${h}</b><span>${tag}</span></div>
  <ul>${items.map(x=>`<li>${x}</li>`).join('')}</ul><div class="sub">${sub}</div><div class="chips">${chips.map(x=>`<span>${x}</span>`).join('')}</div></div>`;
def({id:'s6',chapter:'RETENTION VS RECRUITMENT',mood:[1,620],
  html:()=>`${titleHTML('Scene 06 · The balance','RETENTION VS RECRUITMENT.')}
  <canvas class="full" data-r="cv"></canvas>
  ${col6('l','RETENTION','PRIORITY',['Lower replacement cost','Preserve institutional knowledge','Faster productivity'],'TARGETED ACTIONS',['Stay interviews','Retention bonuses','Succession planning'])}
  ${col6('r','RECRUITMENT','ONGOING',['Fill unavoidable vacancies','Build a talent pipeline','Rapid hiring for Sales and Manufacturing'],'OPERATIONAL TACTICS',['Faster sourcing','Boomerang rehiring','Employer branding'])}
  <div class="v6-fin" data-r="fin"><span>RETAIN STRATEGICALLY.</span><span class="b">RECRUIT CONTINUOUSLY.</span></div>`,
  init(r,s){ s.ctx=hc(r.cv); s.st={L:.82,run:false,inflow:0,drops:[],holes:[{s:-1,h:.62,plug:0},{s:1,h:.44,plug:0},{s:-1,h:.28,plug:0},{s:1,h:.13,plug:0}]};
    gsap.set([...$$('.hd,li,.sub,.chips span',r.L),...$$('.hd,li,.sub,.chips span',r.R),...$$('span',r.fin)],{opacity:0}) },
  enter(){ FX.release(); FX.set({mode:'drift',alpha:.16,trail:0,size:.8,speed:.5,mix:[1,.2,.4,0]}) },
  frame(t,dt,r,s){ const c=s.ctx, st=s.st; if(!c) return; dt=Math.min(dt,.05); c.clearRect(0,0,W,H);
    const {x0,x1,top,bot,floor}=T6, Ht=bot-top;
    if(st.run){ let out=0;
      st.holes.forEach(h=>{ if(h.plug<.98&&st.L>h.h){ const q=Math.sqrt(st.L-h.h); out+=.006*q; h.em=(h.em||0)+dt*46*q; while(h.em>1){ h.em--; if(st.drops.length<700) st.drops.push({x:h.s<0?x0:x1,y:bot-h.h*Ht+rand(-3,3),vx:h.s*rand(80,160)*(.45+q),vy:rand(-30,10),c:1}) } } });
      st.L=clamp(st.L+((st.L<.88?st.inflow:0)-out)*dt,.2,.9);
      if(st.inflow>0){ st.ie=(st.ie||0)+dt*st.inflow*1600; while(st.ie>1){ st.ie--; if(st.drops.length<700) st.drops.push({x:960+rand(-7,7),y:304,vx:0,vy:rand(380,520),c:0}) } } }
    const sy=bot-st.L*Ht;
    c.fillStyle='#151a22'; c.fillRect(942,240,36,62); c.strokeStyle=st.inflow>0?'rgba(98,196,216,.9)':'rgba(238,233,224,.3)'; c.lineWidth=2; c.strokeRect(942,240,36,62);
    const g=c.createLinearGradient(0,sy,0,bot); g.addColorStop(0,'rgba(98,196,216,.55)'); g.addColorStop(1,'rgba(98,196,216,.1)'); c.fillStyle=g;
    c.beginPath(); c.moveTo(x0,bot); for(let x=x0;x<=x1;x+=8) c.lineTo(x,sy+Math.sin(x*.05+t*3)*4); c.lineTo(x1,bot); c.closePath(); c.fill();
    c.strokeStyle='rgba(160,225,240,.9)'; c.lineWidth=2; c.beginPath(); for(let x=x0;x<=x1;x+=8){ const y=sy+Math.sin(x*.05+t*3)*4; x===x0?c.moveTo(x,y):c.lineTo(x,y) } c.stroke();
    c.strokeStyle='rgba(238,233,224,.6)'; c.lineWidth=3; c.beginPath(); c.moveTo(x0,top); c.lineTo(x0,bot); c.lineTo(x1,bot); c.lineTo(x1,top); c.stroke();
    c.strokeStyle='rgba(238,233,224,.2)'; c.lineWidth=1; c.beginPath(); c.moveTo(730,floor); c.lineTo(1190,floor); c.stroke();
    for(let i=st.drops.length-1;i>=0;i--){ const d=st.drops[i]; d.vy+=1400*dt; d.x+=d.vx*dt; d.y+=d.vy*dt; if((d.c&&d.y>floor)||(!d.c&&d.y>sy)){ st.drops.splice(i,1); continue } c.fillStyle=d.c?'rgba(229,84,75,.9)':'rgba(140,215,232,.9)'; c.fillRect(d.x-2.5,d.y-2.5,5,5) }
    st.holes.forEach(h=>{ const hy=bot-h.h*Ht, hx=h.s<0?x0:x1;
      if(h.plug<.98){ c.fillStyle='#06070A'; c.beginPath(); c.arc(hx,hy,7,0,6.283); c.fill(); c.strokeStyle='rgba(229,84,75,.9)'; c.lineWidth=2; c.stroke() }
      if(h.plug>0){ const off=h.s*(1-h.plug)*140; c.save(); c.shadowColor='#F2A247'; c.shadowBlur=14; c.fillStyle='#F2A247'; c.fillRect(hx+off-12,hy-9,24,18); c.restore() } });
    c.font='500 13px "JetBrains Mono",monospace'; c.textAlign='center'; c.fillStyle='rgba(238,233,224,.6)'; c.fillText('W O R K F O R C E',960,bot-20);
    if(st.run){ c.fillStyle='rgba(229,84,75,.85)'; c.fillText('EXITS',x0-56,floor+28); c.fillText('EXITS',x1+56,floor+28) }
    if(st.inflow>0){ c.fillStyle='rgba(98,196,216,.9)'; c.fillText('NEW HIRES',960,228) } c.textAlign='start' },
  steps:[
    function(tl,r,s){ titleIn(tl,s,0); tl.call(()=>{ s.st.run=true; sfx('riser',.8,.12) },null,.3) },
    function(tl,r){ tl.fromTo($('.hd',r.L),{opacity:0,x:-30},{opacity:1,x:0,duration:.7},0).fromTo($$('li',r.L),{opacity:0,x:-20},{opacity:1,x:0,duration:.5,stagger:.2},.4).call(()=>sfx('hit',.6),null,0) },
    function(tl,r,s){ tl.to($('.sub',r.L),{opacity:1,duration:.4},0).fromTo($$('.chips span',r.L),{opacity:0,y:16},{opacity:1,y:0,duration:.4,stagger:.35},.1);
      [0,1,2].forEach(i=>tl.to(s.st.holes[i],{plug:1,duration:.5,ease:'back.out(1.6)'},.2+i*.35).call(()=>{ sfx('snap',1600+i*200); sfx('hit',.5) },null,.65+i*.35)) },
    function(tl,r,s){ tl.fromTo($('.hd',r.R),{opacity:0,x:30},{opacity:1,x:0,duration:.7},0).fromTo($$('li',r.R),{opacity:0,x:20},{opacity:1,x:0,duration:.5,stagger:.2},.4)
        .to(s.st,{inflow:.022,duration:.6},.3).call(()=>{ sfx('whoosh',1,-1); sfx('hit',.6) },null,.3) },
    function(tl,r,s){ tl.to($('.sub',r.R),{opacity:1,duration:.4},0).fromTo($$('.chips span',r.R),{opacity:0,y:16},{opacity:1,y:0,duration:.4,stagger:.25},.1).to(s.st,{inflow:.04,duration:.6},.2);
      [0,1,2].forEach(i=>tl.call(()=>sfx('blip',600+i*150),null,.1+i*.25)) },
    function(tl,r){ tl.fromTo($$('span',r.fin),{opacity:0,y:30,filter:'blur(10px)'},{opacity:1,y:0,filter:'blur(0px)',duration:.7,stagger:.5,ease:'expo.out'},0).call(()=>sfx('boom',.8),null,0).call(()=>{ sfx('boom',1); shake(8) },null,.5) }
  ]});

/* ---------- 7. THREE PILLARS ---------- */
const P7=[{h:'COMPENSATION',c:'#F2A247',it:['Market benchmarking, focused on Sales and Manufacturing','Targeted salary corrections','Retention bonuses and skill-based incentives']},
  {h:'CULTURE',c:'#62C4D8',it:['Recognition programs','Clear career paths and L&amp;D','Mentoring and internal mobility']},
  {h:'TALENT MANAGEMENT',c:'#EEE9E0',it:['Identify flight-risk employees','Succession planning and stay interviews','Faster recruitment plus boomerang hiring']}], X7=[450,960,1470];
def({id:'s7',chapter:'HR STRATEGY',mood:[1,650],
  html:()=>`${titleHTML('Scene 07 · The plan','RECOMMENDED HR STRATEGY.')}
  <svg class="full" viewBox="0 0 1920 1080">
    <g data-r="ped"><polygon class="v7-ped" points="190,380 1730,380 960,232"/><rect class="v7-ent" x="190" y="380" width="1540" height="18"/><text class="v7-pt" data-r="pt" x="960" y="350">EMPLOYEE VALUE PROPOSITION</text></g>
    <g data-r="base"><rect class="v7-st" x="200" y="880" width="1520" height="24"/><rect class="v7-st" x="170" y="904" width="1580" height="22"/></g>
  </svg>
  ${P7.map((p,i)=>`<div class="v7-pil" data-r="p${i}" style="left:${X7[i]-200}px;--c:${p.c}"><div class="n">PILLAR 0${i+1}</div><div class="h">${p.h}</div><ul>${p.it.map(x=>`<li>${x}</li>`).join('')}</ul></div>`).join('')}`,
  init(r){ gsap.set([r.ped,r.base,r.p0,r.p1,r.p2],{opacity:0}) },
  enter(){ FX.release(); FX.set({mode:'drift',alpha:.2,trail:0,size:.85,speed:.5,mix:[1,.4,.3,0]}) },
  steps:[
    function(tl,r,s){ titleIn(tl,s,0); tl.fromTo(r.base,{opacity:0,y:30},{opacity:1,y:0,duration:.8},.3).call(()=>sfx('boom',.5),null,.4) },
    ...[0,1,2].map(i=>function(tl,r){ const p=r['p'+i];
      tl.fromTo(p,{clipPath:'inset(100% 0% 0% 0%)',opacity:1},{clipPath:'inset(0% 0% 0% 0%)',duration:1.1,ease:'power3.inOut'},0)
        .call(()=>sfx('riser',.9,.18),null,0).call(()=>{ sfx('boom',.8); shake(9); FX.burst(X7[i],880,5) },null,1.0)
        .fromTo($$('li',p),{opacity:0,x:-14},{opacity:1,x:0,duration:.5,stagger:.18},1.0) }),
    function(tl,r){ tl.fromTo(r.ped,{y:-560,opacity:1},{y:0,duration:.7,ease:'power4.in'},0).call(()=>{ sfx('boom',1.3); sfx('crack'); shake(24,.7); flash(.3); FX.burst(960,390,12) },null,.7)
        .fromTo(r.pt,{opacity:0},{opacity:1,duration:.8},.9) }
  ]});

/* ---------- 8. RECOMMENDATION ---------- */
const L8=['Avoid blanket 35–60% matching','Correct pay gaps selectively: critical roles and top performers','Use culture: recognition, career paths, boomerang hiring','Prioritize retention for Sales and Manufacturing','Keep recruitment pipelines running for unavoidable exits'];
def({id:'s8',chapter:'RECOMMENDATION',mood:[1.1,700],
  html:()=>`<div class="v8-h" data-r="h"><div class="a" data-r="ha">DON'T FIGHT A</div><div class="b"><span data-r="hb">SALARY WAR.</span><svg class="v8-strike" viewBox="0 0 100 10" preserveAspectRatio="none"><path data-r="sk" pathLength="1" d="M0 7 L100 3"/></svg></div></div>
  <div class="v8-s" data-r="sub">Build a smarter <em>employee value proposition.</em></div>
  <div class="v8-cols" data-r="cols">${[['AVOID SALARY WAR',"Don't match offers across the board."],['TARGETED FIXES','Correct gaps for critical roles and top talent.'],['STRENGTHEN CULTURE','Boost recognition and talent programs.']].map((c,i)=>`<div class="c"><div class="n">MOVE 0${i+1}</div><div class="h">${c[0]}</div><div class="p">${c[1]}</div></div>`).join('')}</div>
  <div class="v8-list" data-r="list">${L8.map(x=>`<div class="it"><i></i><span>${x}</span></div>`).join('')}</div>`,
  init(r){ splitChars(r.ha); splitChars(r.hb); gsap.set([...$$('.ch',r.h),r.sub,...$$('.c',r.cols),...$$('.it',r.list)],{opacity:0}) },
  enter(){ FX.release(); FX.set({mode:'drift',alpha:.22,trail:0,size:.85,speed:.6,mix:[1,.3,.2,.2]}) },
  steps:[
    function(tl,r){ tl.fromTo($$('.ch',r.ha),{opacity:0,y:40},{opacity:1,y:0,duration:.6,stagger:.04,ease:'expo.out'},0).call(()=>sfx('hit',.6),null,0)
        .fromTo($$('.ch',r.hb),{opacity:0,scale:2.4,filter:'blur(20px)'},{opacity:1,scale:1,filter:'blur(0px)',duration:.5,stagger:.03,ease:'expo.in'},.5).call(()=>{ sfx('boom',1); shake(14); flash(.2) },null,1.1)
        .to(r.sk,{strokeDashoffset:0,duration:.35,ease:'power3.in'},1.7).call(()=>{ sfx('crack'); shake(10) },null,2.05) },
    function(tl,r){ tl.fromTo(r.sub,{opacity:0,y:30,filter:'blur(8px)'},{opacity:1,y:0,filter:'blur(0px)',duration:1},0).call(()=>sfx('chime',392,.16),null,0) },
    function(tl,r){ tl.to(r.sub,{opacity:0,duration:.4},0).to(r.h,{y:-210,scale:.4,transformOrigin:'50% 0%',duration:.9,ease:'power3.inOut'},0).call(()=>sfx('whoosh',.8,-1),null,0);
      $$('.c',r.cols).forEach((c,i)=>tl.fromTo(c,{opacity:0,y:50},{opacity:1,y:0,duration:.7,ease:'expo.out'},.7+i*.3).call(()=>sfx('hit',.5+i*.1),null,.7+i*.3)) },
    function(tl,r){ $$('.it',r.list).forEach((it,i)=>{ const at=i*.42; tl.fromTo(it,{opacity:0,x:-24},{opacity:1,x:0,duration:.5},at).call(()=>{ $('i',it).classList.add('on'); sfx('snap',1500+i*160) },null,at+.25) }) }
  ]});

/* ---------- 9. THE CLOSE ---------- */
const Q9='but a strong employee value proposition can give them reasons to stay.';
def({id:'s9',chapter:'REASONS TO STAY',letterbox:true,mood:[.5,240],
  html:()=>`<div class="v9-light" data-r="light"></div>
  <div class="v9-l v9-l1" data-r="l1">Compensation may pull employees away,</div>
  <div class="v9-l v9-l2" data-r="l2">${Q9}</div>
  <div class="v9-big" data-r="big">REASONS TO STAY.</div>
  <div class="v9-k" data-r="k">VELCURE LUBRICANTS · HRM CASE STUDY · GROUP 7</div>
  <div class="v9-ty" data-r="ty">Thank you.</div>`,
  init(r){ splitChars(r.l1); const cs=splitChars(r.l2), at=Q9.indexOf('reasons to stay'); cs.forEach((c,i)=>{ if(i>=at&&i<at+15) c.classList.add('hi') });
    gsap.set([r.light,...$$('.ch',r.l1),...cs,r.big,r.k,r.ty],{opacity:0}) },
  enter(){ FX.release(); FX.set({mode:'drift',trail:0,speed:.3,size:.7,mix:[1,.15,0,0]}); gsap.to(FX.S,{alpha:.08,duration:2}) },
  steps:[
    function(tl,r){ tl.to(r.light,{opacity:1,duration:3},0).fromTo($$('.ch',r.l1),{opacity:0,filter:'blur(10px)',y:10},{opacity:1,filter:'blur(0px)',y:0,duration:1.4,stagger:.035,ease:'power2.out'},.2).call(()=>sfx('chime',220,.12),null,.2) },
    function(tl,r){ tl.to(r.l1,{opacity:.45,duration:1},0).fromTo($$('.ch',r.l2),{opacity:0,filter:'blur(10px)',y:10},{opacity:1,filter:'blur(0px)',y:0,duration:1.2,stagger:.025,ease:'power2.out'},.3).call(()=>sfx('chime',329.63,.12),null,.3).call(()=>sfx('chime',440,.12),null,2.0) },
    function(tl,r,s){ tl.to([r.l1,r.l2],{opacity:0,y:-24,filter:'blur(10px)',duration:.8,ease:'power2.in'},0).to(FX.S,{gain:0,duration:2},0).call(()=>SND.mood(.22,180),null,0)
        .fromTo(r.big,{opacity:0,scale:1.12,filter:'blur(24px)'},{opacity:1,scale:1,filter:'blur(0px)',duration:2,ease:'power2.out'},.9).call(()=>sfx('boom',.8),null,.9)
        .fromTo(r.k,{opacity:0,letterSpacing:'0.9em'},{opacity:1,letterSpacing:'0.44em',duration:1.8,ease:'power2.out'},1.8)
        .fromTo(r.ty,{opacity:0,y:16},{opacity:1,y:0,duration:1.2},2.6).call(()=>sfx('chime',220,.14),null,2.6)
        .call(()=>loop(s,gsap.fromTo(r.big,{backgroundPosition:'100% 0'},{backgroundPosition:'0% 0',duration:3.2,repeat:-1,repeatDelay:3,ease:'power1.inOut'})),null,2.6) }
  ]});

