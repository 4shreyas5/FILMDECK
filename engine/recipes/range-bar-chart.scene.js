
/* ---------- __SID__ · range-bar-chart (adapted from Velcure scene 3) ---------- */
const __P__D=__DATA__;
const __P__X=v=>620+(v-__P__D.scale.min)/(__P__D.scale.max-__P__D.scale.min)*1110;
const __P__R=(()=>{ const n=__P__D.rows.length, top=340, bot=620, pitch=(bot-top)/n, h=Math.max(36,Math.min(70,pitch-50));
  return __P__D.rows.map((row,i)=>({...row,y:top+i*pitch+(pitch-h)/2,h,col:__P__D.toneVars[row.tone]})) })();
const __P__edge=e=>{ const f=__P__R[e.row].value; return e.edge==='lo'?f.lo:f.hi };
def({id:'__SID__',chapter:__CHAPTER__,letterbox:__LETTERBOX__,mood:__MOOD__,
  html:()=>{ const S=__P__D.scale, X=__P__X; let grid=''; const n=Math.round((S.max-S.min)/S.step);
    for(let i=0;i<=n;i++){ const v=+(S.min+i*S.step).toFixed(6); grid+=`<line x1="${X(v)}" y1="320" x2="${X(v)}" y2="630" class="__C__-gl"/><text class="__C__-tl" x="${X(v)}" y="662">${FD_ESC(v+S.unit)}</text>` }
    const bars=__P__R.map((b,i)=>{ const f=b.value, solidTo=f.kind==='range'?f.lo:f.v, rng=f.kind==='range'?`<rect x="${X(f.lo)}" y="${b.y}" width="${X(f.hi)-X(f.lo)}" height="${b.h}" fill="${b.col}" fill-opacity=".35" stroke="${b.col}" stroke-dasharray="6 5"/>`:'';
      return `<text class="__C__-rl" data-r="rl${i}" x="590" y="${b.y+b.h/2+10}">${FD_ESC(b.label)}</text>
      <g data-r="bar${i}"><rect x="${X(S.min)}" y="${b.y}" width="${X(solidTo)-X(S.min)}" height="${b.h}" fill="${b.col}"/>${rng}</g>
      <text class="__C__-vl" data-r="vl${i}" x="${X(f.hi)+18}" y="${b.y+b.h/2+14}" fill="${b.col}">${FD_ESC(f.display)}</text>` }).join('');
    let gap=''; const G=__P__D.gap; if(G){ const a=X(__P__edge(G.from)), b=X(__P__edge(G.to)), x1=Math.min(a,b), x2=Math.max(a,b), up=__P__R[Math.min(G.from.row,G.to.row)], lo=__P__R[Math.max(G.from.row,G.to.row)], y=up.y+up.h+(lo.y-up.y-up.h)/2;
      gap=`<g data-r="gap" opacity="0"><line x1="${x1}" y1="${up.y-10}" x2="${x1}" y2="${lo.y+lo.h+10}" class="__C__-gd"/><line x1="${x2}" y1="${up.y-10}" x2="${x2}" y2="${lo.y+lo.h+10}" class="__C__-gd"/>
        <path class="__C__-gb" d="M${x1+4} ${y} H${x2-4} M${x1+14} ${y-8} L${x1+4} ${y} L${x1+14} ${y+8} M${x2-14} ${y-8} L${x2-4} ${y} L${x2-14} ${y+8}"/>
        <text class="__C__-gt" x="${(x1+x2)/2}" y="${y+27}">${FD_ESC((G.prefix+' '+G.value.display).toUpperCase())}</text></g>` }
    const cl=__P__D.cards.length===1?[660]:[300,1010];
    const cards=__P__D.cards.map((c,i)=>`<div class="__C__-cd" data-r="c${i}" style="left:${cl[i]}px;--tone:${__P__D.toneVars[c.tone]}"><div class="h">${FD_ESC(c.head)}</div><div class="p">${FD_ESC(c.text)}</div></div>`).join('');
    return `${titleHTML(FD_ESC(__P__D.kicker),FD_ESC(__P__D.title))}
    <div class="__C__-a" data-r="a">
      <svg class="full" viewBox="0 0 1920 1080">
        <g data-r="ax" opacity="0">${grid}<line x1="${X(S.min)}" y1="630" x2="${X(S.max)}" y2="630" class="__C__-ax"/>${__P__D.axisLabel?`<text class="__C__-at" x="${X(S.max)}" y="704">${FD_ESC(__P__D.axisLabel)}</text>`:''}</g>
        ${bars}${gap}
      </svg>
      ${cards}
    </div>
    <div class="__C__-v"><div class="k" data-r="vk">${FD_ESC(__P__D.verdict.kicker)}</div><div class="b" data-r="vb">${FD_ESC(__P__D.verdict.word)}</div><div class="s" data-r="vs">${FD_ESC(__P__D.verdict.sub)}</div></div>` },
  init(r){ __P__R.forEach((b,i)=>{ gsap.set(r['bar'+i],{scaleX:0,svgOrigin:`${__P__X(__P__D.scale.min)} ${b.y}`}); gsap.set([r['rl'+i],r['vl'+i]],{opacity:0}) });
    gsap.set([r.vk,r.vb,r.vs,...__P__D.cards.map((_,i)=>r['c'+i])],{opacity:0}) },
  enter(){ FX.release(); FX.set({mode:'drift',alpha:.2,trail:0,size:.85,speed:.6,mix:[1,.2,.3,.15]}) },
  steps:(()=>{ const st=[], R=__P__R, X0=__P__X(__P__D.scale.min), rest=R.length>1||!!__P__D.gap, hasCards=__P__D.cards.length>0;
    st.push(function(tl,r,s){ titleIn(tl,s,0); tl.to(r.ax,{opacity:1,duration:.8},.4) });
    st.push(function(tl,r){ tl.to(r.rl0,{opacity:1,duration:.5},.1).to(r.bar0,{scaleX:1,svgOrigin:`${X0} ${R[0].y}`,duration:1.3,ease:'expo.out'},.2)
        .call(()=>sfx('riser',.5,.2),null,0).call(()=>{ sfx('boom',.9); shake(8) },null,.5).fromTo(r.vl0,{opacity:0,x:-20},{opacity:1,x:0,duration:.5},1.1) });
    if(rest) st.push(function(tl,r){
      for(let i=1;i<R.length;i++){ const k=i-1; tl.to(r['rl'+i],{opacity:1,duration:.4},.1+k*.35).to(r['bar'+i],{scaleX:1,svgOrigin:`${X0} ${R[i].y}`,duration:.9,ease:'expo.out'},.15+k*.35).to(r['vl'+i],{opacity:1,duration:.4},.6+k*.35).call(()=>sfx('hit',.4),null,.2+k*.35) }
      if(r.gap) tl.to(r.gap,{opacity:1,duration:.6},.3+(R.length-1)*.35+.6).call(()=>{ sfx('glitch'); sfx('blip',330) },null,.3+(R.length-1)*.35+.6) });
    if(hasCards) st.push(function(tl,r){ __P__D.cards.forEach((_,i)=>tl.fromTo(r['c'+i],{opacity:0,y:30},{opacity:1,y:0,duration:.7},i*.35));
      tl.call(()=>{ FX.set({mode:'flow',sy:860,alpha:.45,mix:[.6,.4,.2,1]}); sfx('whoosh',1.4,1) },null,.2) });
    st.push(function(tl,r){ tl.to(r.a,{opacity:.07,filter:'blur(4px)',duration:.7},0).call(()=>FX.set({mode:'drift',alpha:.25}),null,0)
        .to(r.vk,{opacity:1,duration:.5},.4).fromTo(r.vb,{opacity:0,scale:1.8,filter:'blur(20px)'},{opacity:1,scale:1,filter:'blur(0px)',duration:.45,ease:'expo.in'},.5).call(()=>{ sfx('boom',1.1); shake(16); flash(.2) },null,.95)
        .fromTo(r.vs,{opacity:0,y:20},{opacity:1,y:0,duration:.8},1.3) });
    return st })()
});
