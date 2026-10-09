(()=>{
'use strict';
const W=1920,H=1080;
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const rand=(a,b)=>a+Math.random()*(b-a);
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const pick=a=>a[Math.floor(Math.random()*a.length)];
const RM=matchMedia('(prefers-reduced-motion: reduce)').matches;
const DISP='"Barlow Condensed","Arial Narrow",sans-serif';
let SC=1, INSTANT=false;
gsap.defaults({ease:'power3.out'});

const stage=$('#stage'), world=$('#world'), viewport=$('#viewport');

/* ================= AUDIO ================= */
const SND=(()=>{
  let ac=null,master,bus,verbIn,nb,padG,padF,on=true;
  const o={};
  function imp(sec,dec){const len=Math.floor(ac.sampleRate*sec),b=ac.createBuffer(2,len,ac.sampleRate);for(let c=0;c<2;c++){const d=b.getChannelData(c);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,dec)}return b}
  o.init=()=>{
    if(ac){if(ac.resume)ac.resume();return}
    const AC=window.AudioContext||window.webkitAudioContext; if(!AC)return;
    try{ac=new AC()}catch(e){return}
    master=ac.createGain(); master.gain.value=on?.85:0;
    const comp=ac.createDynamicsCompressor(); comp.threshold.value=-16; comp.knee.value=12; comp.ratio.value=5; comp.attack.value=.004; comp.release.value=.25;
    master.connect(comp); comp.connect(ac.destination);
    bus=ac.createGain(); bus.gain.value=.6; bus.connect(master);
    const verb=ac.createConvolver(); verb.buffer=imp(3,2.4); const vg=ac.createGain(); vg.gain.value=.35; verb.connect(vg); vg.connect(master); verbIn=verb;
    nb=ac.createBuffer(1,ac.sampleRate*2,ac.sampleRate); const d=nb.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1;
    pad();
  };
  const ok=()=>ac&&on;
  function send(n,wet=.25){n.connect(bus); if(wet>0){const g=ac.createGain(); g.gain.value=wet; n.connect(g); g.connect(verbIn)}}
  function G(t,a,peak,rel){const g=ac.createGain(); g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(Math.max(peak,.0002),t+a); g.gain.exponentialRampToValueAtTime(.0001,t+a+rel); return g}
  function noise(t,dur){const s=ac.createBufferSource(); s.buffer=nb; s.loop=true; s.start(t,Math.random()); s.stop(t+dur+.05); return s}
  function osc(type,f,t,dur){const s=ac.createOscillator(); s.type=type; s.frequency.setValueAtTime(f,t); s.start(t); s.stop(t+dur+.05); return s}
  function filt(type,f,q=.8){const b=ac.createBiquadFilter(); b.type=type; b.frequency.value=f; b.Q.value=q; return b}
  o.whoosh=(d=.9,dir=1)=>{ if(!ok())return; const t=ac.currentTime,n=noise(t,d),f=filt('bandpass',dir>0?220:2800,1.1);
    f.frequency.setValueAtTime(dir>0?220:2800,t); f.frequency.exponentialRampToValueAtTime(dir>0?2800:220,t+d);
    const g=ac.createGain(); g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.55,t+d*.55); g.gain.exponentialRampToValueAtTime(.0001,t+d);
    n.connect(f); f.connect(g);
    if(ac.createStereoPanner){const p=ac.createStereoPanner(); p.pan.setValueAtTime(-.6*dir,t); p.pan.linearRampToValueAtTime(.6*dir,t+d); g.connect(p); send(p,.3)} else send(g,.3) };
  o.boom=(l=1)=>{ if(!ok())return; const t=ac.currentTime,s=osc('sine',120,t,1.8); s.frequency.exponentialRampToValueAtTime(32,t+1.2); const g=G(t,.008,.95*l,1.6); s.connect(g); send(g,.22);
    const n=noise(t,.4),lp=filt('lowpass',520),g2=G(t,.003,.5*l,.32); n.connect(lp); lp.connect(g2); send(g2,.3) };
  o.hit=(l=.6)=>{ if(!ok())return; const t=ac.currentTime,n=noise(t,.25),hp=filt('highpass',1400),g=G(t,.002,.42*l,.16); n.connect(hp); hp.connect(g); send(g,.3);
    const s=osc('triangle',260,t,.3); s.frequency.exponentialRampToValueAtTime(70,t+.15); const g2=G(t,.002,.5*l,.2); s.connect(g2); send(g2,.25) };
  o.tick=(f=1500,l=.1)=>{ if(!ok())return; const t=ac.currentTime,s=osc('square',f,t,.08),g=G(t,.001,l,.05); s.connect(g); send(g,.12) };
  o.blip=(f=880,l=.16)=>{ if(!ok())return; const t=ac.currentTime,s=osc('sine',f,t,.2); s.frequency.exponentialRampToValueAtTime(f*1.5,t+.08); const g=G(t,.005,l,.14); s.connect(g); send(g,.3) };
  o.riser=(d=1.6,l=.45)=>{ if(!ok())return; const t=ac.currentTime,n=noise(t,d),bp=filt('bandpass',300,2); bp.frequency.setValueAtTime(300,t); bp.frequency.exponentialRampToValueAtTime(5200,t+d);
    const g=ac.createGain(); g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(l,t+d); g.gain.exponentialRampToValueAtTime(.0001,t+d+.08); n.connect(bp); bp.connect(g); send(g,.35);
    const s=osc('sawtooth',90,t,d),lp=filt('lowpass',1400); s.frequency.exponentialRampToValueAtTime(720,t+d); const g2=ac.createGain(); g2.gain.setValueAtTime(.0001,t); g2.gain.exponentialRampToValueAtTime(.1,t+d); g2.gain.exponentialRampToValueAtTime(.0001,t+d+.08); s.connect(lp); lp.connect(g2); send(g2,.3) };
  o.glitch=()=>{ if(!ok())return; let t=ac.currentTime; for(let k=0;k<4;k++){ const dur=rand(.015,.05),s=osc('square',rand(80,2400),t,dur),g=G(t,.001,.07,dur); s.connect(g); send(g,.05); t+=rand(.02,.05)} };
  o.crack=()=>{ if(!ok())return; const t=ac.currentTime,n=noise(t,.2),hp=filt('highpass',2200),g=G(t,.001,.7,.12); n.connect(hp); hp.connect(g); send(g,.4); o.hit(.8); o.boom(.45) };
  o.snap=(f=2200)=>{ if(!ok())return; o.tick(f,.12); const t=ac.currentTime,n=noise(t,.08),hp=filt('highpass',3000),g=G(t,.001,.28,.04); n.connect(hp); hp.connect(g); send(g,.15) };
  o.chime=(f=440,l=.2)=>{ if(!ok())return; const t=ac.currentTime,s=osc('sine',f,t,3.4),g=G(t,.03,l,3.2); s.connect(g); send(g,.6); const s2=osc('triangle',f*2,t,2.2),g2=G(t,.03,l*.25,2); s2.connect(g2); send(g2,.6) };
  o.chalk=()=>{ if(!ok())return; const t=ac.currentTime,n=noise(t,.45),bp=filt('bandpass',2600,3.5),g=ac.createGain(); g.gain.setValueAtTime(.0001,t);
    for(let i=0;i<9;i++){ g.gain.setValueAtTime(rand(.03,.16),t+i*.045) } g.gain.setValueAtTime(.0001,t+.42); n.connect(bp); bp.connect(g); send(g,.1) };
  function pad(){ padG=ac.createGain(); padG.gain.value=0; padF=filt('lowpass',400,.7); padF.connect(padG); padG.connect(master);
    [55,55.35,82.41,110.2].forEach((f,i)=>{ const s=ac.createOscillator(); s.type=i<3?'sawtooth':'sine'; s.frequency.value=f; const g=ac.createGain(); g.gain.value=i<3?.2:.32; s.connect(g); g.connect(padF); s.start() });
    const lfo=ac.createOscillator(); lfo.frequency.value=.06; const lg=ac.createGain(); lg.gain.value=140; lfo.connect(lg); lg.connect(padF.frequency); lfo.start(); }
  o.mood=(level=1,cut=500)=>{ if(!ac)return; padG.gain.setTargetAtTime(.05*level,ac.currentTime,1.2); padF.frequency.setTargetAtTime(cut,ac.currentTime,1.5) };
  o.toggle=()=>{ on=!on; if(ac) master.gain.setTargetAtTime(on?.85:0,ac.currentTime,.05); return on };
  o.isOn=()=>on;
  return o;
})();
const sfx=(n,...a)=>{ if(!INSTANT && SND[n]) SND[n](...a) };

/* ================= PARTICLES ================= */
const FX=(()=>{
  const cv=$('#fx'), c=cv.getContext('2d');
  const N=RM?500:(Math.min(innerWidth,innerHeight)<600?700:1500);
  const ps=[]; const COL=['238,233,224','242,162,71','98,196,216','229,84,75'];
  for(let i=0;i<N;i++) ps.push({x:Math.random()*W,y:Math.random()*H,vx:0,vy:0,tx:0,ty:0,t:false,z:.25+Math.random()*.75,c:0,s:.8+Math.random()*1.6,ph:Math.random()*6.283});
  const S={mode:'drift',alpha:.3,alphaT:.95,gain:1,trail:0,size:1,speed:1,k:.06,damp:.82,jitter:.5,cx:W/2,cy:H/2,streak:0,sy:450};
  const oc=document.createElement('canvas'); oc.width=W; oc.height=H; const ox=oc.getContext('2d',{willReadFrequently:true});
  function resize(){ const px=SC*Math.min(2,devicePixelRatio||1); cv.width=Math.max(1,Math.round(W*px)); cv.height=Math.max(1,Math.round(H*px)); c.setTransform(px,0,0,px,0,0) }
  function setMix(m){ const tot=m.reduce((a,b)=>a+b,0)||1; for(const p of ps){ let r=Math.random()*tot,i=0; while(i<3&&r>m[i]){r-=m[i];i++} p.c=i } }
  function set(o){ if(o.mix) setMix(o.mix); for(const k in o) if(k!=='mix') S[k]=o[k] }
  function textPoints(txt,x,y,size,o={}){
    const gap=o.gap||5; ox.clearRect(0,0,W,H); ox.fillStyle='#fff'; ox.font=`${o.weight||900} ${size}px ${o.family||DISP}`; ox.textAlign='center'; ox.textBaseline='middle'; ox.fillText(txt,x,y);
    const y0=Math.max(0,Math.floor(y-size)), hh=Math.min(H-y0,Math.ceil(size*2)); const d=ox.getImageData(0,y0,W,hh).data; const pts=[];
    for(let yy=0;yy<hh;yy+=gap) for(let xx=0;xx<W;xx+=gap){ if(d[(yy*W+xx)*4+3]>128) pts.push([xx+rand(-1,1),y0+yy+rand(-1,1)]) }
    return pts }
  function gridPoints(x0,y0,x1,y1,g){ const p=[]; for(let y=y0;y<=y1;y+=g) for(let x=x0;x<=x1;x+=g) p.push([x,y]); return p }
  function sub(pts,n){ if(pts.length<=n) return pts; const o=[],st=pts.length/n; for(let i=0;i<n;i++) o.push(pts[Math.floor(i*st)]); return o }
  function targets(pts){ const use=sub(pts,ps.length); const idx=ps.map((_,i)=>i).sort(()=>Math.random()-.5); idx.forEach((pi,j)=>{ const p=ps[pi]; if(j<use.length){p.t=true;p.tx=use[j][0];p.ty=use[j][1]} else p.t=false }) }
  function release(){ for(const p of ps) p.t=false }
  function burst(cx,cy,pw){ for(const p of ps){ const dx=p.x-cx,dy=p.y-cy,d=Math.hypot(dx,dy)+1; const f=pw*rand(.2,1)*p.z; p.vx+=dx/d*f; p.vy+=dy/d*f } }
  function explodeFrom(pts,pw){ const use=sub(pts,ps.length); let mx=0,my=0; use.forEach(q=>{mx+=q[0];my+=q[1]}); mx/=use.length||1; my/=use.length||1;
    use.forEach((q,i)=>{ const p=ps[i]; p.t=false; p.x=q[0]; p.y=q[1]; const dx=q[0]-mx+rand(-40,40),dy=q[1]-my+rand(-40,40),d=Math.hypot(dx,dy)+1; const f=pw*rand(.3,1.3); p.vx=dx/d*f; p.vy=dy/d*f }) }
  function wrap(p){ if(p.x<-30)p.x=W+30; else if(p.x>W+30)p.x=-30; if(p.y<-30)p.y=H+30; else if(p.y>H+30)p.y=-30 }
  function update(t){
    for(const p of ps){
      if(p.t){ p.vx=(p.vx+(p.tx-p.x)*S.k)*S.damp; p.vy=(p.vy+(p.ty-p.y)*S.k)*S.damp; p.x+=p.vx+Math.sin(t*2.1+p.ph)*S.jitter*.15; p.y+=p.vy+Math.cos(t*1.7+p.ph)*S.jitter*.15; continue }
      switch(S.mode){
        case 'chaos':{ const a=Math.sin(p.x*.005+t*1.3)*Math.cos(p.y*.004-t)*6.283+p.ph; p.vx+=Math.cos(a)*.9*S.speed; p.vy+=Math.sin(a)*.9*S.speed; p.vx*=.93; p.vy*=.93; p.x+=p.vx*p.z; p.y+=p.vy*p.z; wrap(p); break }
        case 'vortex':{ const dx=S.cx-p.x,dy=S.cy-p.y,d=Math.hypot(dx,dy)+1; p.vx+=dx/d*.6+(-dy/d)*.85; p.vy+=dy/d*.6+(dx/d)*.85; p.vx*=.95; p.vy*=.95; p.x+=p.vx; p.y+=p.vy;
          if(d<16){ const a=Math.random()*6.283,r=rand(500,1000); p.x=S.cx+Math.cos(a)*r; p.y=S.cy+Math.sin(a)*r; p.vx=p.vy=0 } break }
        case 'flow':{ p.vx+=(5*p.z+2-p.vx)*.06; const ty=S.sy+Math.sin(p.ph*3+p.x*.008+t*1.5)*60*p.z; p.vy+=(ty-p.y)*.012; p.vy*=.9; p.x+=p.vx; p.y+=p.vy; if(p.x>W+20){p.x=-20;p.y=S.sy+rand(-220,220)} break }
        default:{ p.vx+=Math.sin(t*.3+p.ph+p.y*.002)*.02; p.vy+=Math.cos(t*.25+p.ph+p.x*.002)*.02-.004; p.vx*=.97; p.vy*=.97; p.x+=p.vx*p.z*S.speed; p.y+=p.vy*p.z*S.speed; wrap(p) }
      }
    }
  }
  function draw(){
    if(S.trail>0){ c.globalCompositeOperation='source-over'; c.fillStyle=`rgba(6,7,10,${1-S.trail})`; c.fillRect(0,0,W,H) } else c.clearRect(0,0,W,H);
    c.globalCompositeOperation='lighter'; const streak=S.streak>.05;
    for(let g=0;g<4;g++) for(let tt=0;tt<2;tt++){
      const al=(tt?S.alphaT:S.alpha)*S.gain; if(al<.005) continue;
      c.beginPath(); let any=false;
      for(const p of ps){ if(p.c!==g||(p.t?1:0)!==tt) continue; any=true;
        if(streak){ c.moveTo(p.x-p.vx*S.streak,p.y-p.vy*S.streak); c.lineTo(p.x+.1,p.y) }
        else { const sz=p.s*S.size*(tt?1:p.z); c.rect(p.x-sz/2,p.y-sz/2,sz,sz) } }
      if(!any) continue;
      if(streak){ c.strokeStyle=`rgba(${COL[g]},${al})`; c.lineWidth=1.3*S.size; c.stroke() } else { c.fillStyle=`rgba(${COL[g]},${al})`; c.fill() }
    }
    c.globalCompositeOperation='source-over';
  }
  function pulse(dir){ burst(W/2,H/2,dir>0?14:-10); gsap.fromTo(S,{streak:0},{streak:4,duration:.45,yoyo:true,repeat:1,ease:'power2.inOut'}) }
  return {S,set,resize,textPoints,gridPoints,targets,release,burst,explodeFrom,update,draw,pulse};
})();

/* ================= HELPERS ================= */
function splitChars(el){ const t=el.textContent; el.innerHTML=[...t].map(ch=>`<span class="ch">${ch===' '?'&nbsp;':ch}</span>`).join(''); return [...el.children] }
function titleHTML(kick,text,slot){ const ws=text.split(' ').map(w=>`<span class="w"><span class="wi">${w}</span></span>`).join(' ');
  return `<div class="kick">${kick}</div><h2 class="title" data-r="title">${ws}${slot?` <span class="w"><span class="wi slot" data-r="slot">${slot}</span></span>`:''}</h2>` }
function prepTitle(el){ const wi=$$('.title .wi',el); if(wi.length) gsap.set(wi,{yPercent:115}) }
function titleIn(tl,s,at=0){ const wi=$$('.title .wi:not(.slot)',s.el), k=$('.kick',s.el); if(!wi.length) return;
  tl.to(wi,{yPercent:0,duration:1,stagger:.06,ease:'expo.out'},at).to(k,{opacity:1,duration:.8},at+.25).call(()=>sfx('hit',.5),null,at) }
function shake(p=10,d=.5){ if(RM||INSTANT) return; const o={v:1}; gsap.to(o,{v:0,duration:d,ease:'power2.out',onUpdate(){ gsap.set(world,{x:rand(-1,1)*p*o.v,y:rand(-1,1)*p*o.v}) },onComplete(){ gsap.set(world,{x:0,y:0}) }}) }
function flash(a=.5,d=.6){ if(INSTANT||RM) return; gsap.fromTo('#flash',{opacity:a},{opacity:0,duration:d,ease:'power2.out'}) }
function hc(cv){ const px=SC*Math.min(2,devicePixelRatio||1); cv.width=Math.max(1,Math.round(W*px)); cv.height=Math.max(1,Math.round(H*px)); const c=cv.getContext('2d'); c.setTransform(px,0,0,px,0,0); return c }
const NOW=()=>gsap.ticker.time;

/* ================= SLIDES ================= */
const SL=[];
function def(o){ o.el=document.getElementById(o.id); o.tls=[]; o.loops=[]; o.timers=[]; o.r={}; o.st={}; o.on=false; SL.push(o); return o }
function kill(s){ s.tls.forEach(t=>t.kill()); s.loops.forEach(t=>t&&t.kill&&t.kill()); s.timers.forEach(clearInterval); s.tls=[]; s.loops=[]; s.timers=[]; const all=s.el.querySelectorAll('*'); if(all.length) gsap.killTweensOf(all) }
function build(s){ kill(s); s.el.innerHTML=s.html(); s.r={}; $$('[data-r]',s.el).forEach(e=>s.r[e.dataset.r]=e); s.st={}; s.ctx=null; prepTitle(s.el); if(s.init) s.init(s.r,s) }
const loop=(s,tw)=>{ s.loops.push(tw); return tw };
/* @@FILM_SCENES@@ */
/* ================= ENGINE ================= */
let cur=0, step=0, transTl=null, started=false;
const chap=$('#hud .chap'), dots=$('#hud .dots');
function hud(){ const s=SL[cur]; chap.textContent=`${String(cur+1).padStart(2,'0')} / ${SL.length}   ${s.chapter}`;
  dots.innerHTML=s.steps.map((_,i)=>`<i class="${i<step?'done':''}"></i>`).join(''); $('#hud').classList.toggle('quiet',!!s.letterbox); $('#tc').classList.toggle('quiet',!!s.letterbox) }
function letterbox(on){ gsap.to('.bar.top',{yPercent:on?0:-100,duration:1.2,ease:'power3.inOut'}); gsap.to('.bar.bot',{yPercent:on?0:100,duration:1.2,ease:'power3.inOut'}) }
function runStep(s,i,instant){ INSTANT=!!instant; const tl=gsap.timeline({paused:!!instant}); s.tls.push(tl); try{ s.steps[i].call(s,tl,s.r,s) }catch(e){ console.error(e) } if(instant) tl.progress(1); INSTANT=false }
function finish(s){ if(!s.tls.length) return; INSTANT=true; s.tls.forEach(t=>{ if(t.progress()<1) t.progress(1) }); INSTANT=false }
function activate(s,toEnd){ gsap.killTweensOf(FX.S); FX.set({gain:1,streak:0}); build(s); s.el.classList.add('on'); s.on=true; if(s.enter) s.enter(s.r,s); if(toEnd) for(let i=0;i<s.steps.length;i++) runStep(s,i,true); SND.mood(...(s.mood||[1,500])); letterbox(!!s.letterbox) }
function go(n,dir,toEnd){
  if(n<0||n>=SL.length||n===cur) return; const a=SL[cur], b=SL[n]; finish(a);
  activate(b,toEnd); sfx('whoosh',1,dir); FX.pulse(dir);
  const tl=gsap.timeline({onComplete(){ a.el.classList.remove('on'); a.on=false; kill(a); a.el.innerHTML=''; gsap.set(a.el,{clearProps:'all'}); transTl=null }});
  const ex=(a.exitFx&&dir>0)?.3:0; if(ex) a.exitFx(tl,a.r);
  tl.to(a.el,{scale:dir>0?1.45:.72,opacity:0,filter:'blur(16px)',duration:.85,ease:'power2.in'},ex)
    .fromTo(b.el,{scale:dir>0?.72:1.4,opacity:0,filter:'blur(14px)'},{scale:1,opacity:1,filter:'blur(0px)',duration:1.1,ease:'power3.out',clearProps:'filter,transform,opacity'},ex+.4);
  transTl=tl; cur=n; step=toEnd?b.steps.length:0; hud();
}
function next(){ if(!started) return; if(transTl){ transTl.progress(1); return } const s=SL[cur]; finish(s);
  if(step<s.steps.length){ runStep(s,step,false); step++; hud() } else if(cur<SL.length-1) go(cur+1,1,false) }
function prev(){ if(!started) return; if(transTl){ transTl.progress(1); return } const s=SL[cur];
  if(step>0){ finish(s); const st=step-1; kill(s); activate(s,false); for(let i=0;i<st;i++) runStep(s,i,true); step=st; hud() }
  else if(cur>0) go(cur-1,-1,true) }
function jumpTo(n){ if(!started||n===cur||n<0||n>=SL.length) return; if(transTl) transTl.progress(1); go(n,n>cur?1:-1,false) }

/* ================= STAGE / LOOP ================= */
function fit(){ const w=viewport.clientWidth,h=viewport.clientHeight; SC=Math.min(w/W,h/H); stage.style.transform=`translate(${((w-W*SC)/2).toFixed(1)}px,${((h-H*SC)/2).toFixed(1)}px) scale(${SC})`;
  FX.resize(); SL.forEach(s=>{ if(s.on&&s.r.cv) s.ctx=hc(s.r.cv) }) }
addEventListener('resize',fit);
// film grain frames
(()=>{ const urls=[]; for(let k=0;k<4;k++){ const c=document.createElement('canvas'); c.width=c.height=256; const x=c.getContext('2d'), d=x.createImageData(256,256); for(let i=0;i<d.data.length;i+=4){ const v=Math.random()*255; d.data[i]=d.data[i+1]=d.data[i+2]=v; d.data[i+3]=255 } x.putImageData(d,0,0); urls.push(c.toDataURL()) }
  const g=$('#grain'); let k=0; if(!RM) setInterval(()=>{ g.style.backgroundImage=`url(${urls[k++%4]})`; g.style.backgroundPosition=`${Math.floor(Math.random()*256)}px ${Math.floor(Math.random()*256)}px` },70); else g.style.backgroundImage=`url(${urls[0]})` })();
const tcEl=$('#tc'); let t0=0;
gsap.ticker.add((time,delta)=>{ const dt=Math.min(delta/1000,.05); FX.update(time); FX.draw(); for(const s of SL) if(s.on&&s.frame){ try{ s.frame(time,dt,s.r,s) }catch(e){ console.error(e); s.frame=null } }
  if(started){ const e=time-t0, f=Math.floor((e%1)*24); tcEl.textContent=[Math.floor(e/3600),Math.floor(e/60)%60,Math.floor(e)%60,f].map(v=>String(v).padStart(2,'0')).join(':') } });

/* ================= INPUT ================= */
const blackout=$('#blackout'), help=$('#help');
function toggleFull(){ try{ if(document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen&&document.documentElement.requestFullscreen().catch(()=>{}) }catch(e){} }
function toggleSound(){ SND.init(); const on=SND.toggle(); $('#bSound').textContent=on?'SOUND ON':'SOUND OFF' }
addEventListener('keydown',e=>{
  if(!started){ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); begin() } return }
  const k=e.key;
  if(['ArrowRight','ArrowDown','PageDown',' ','Enter'].includes(k)){ e.preventDefault(); if(blackout.classList.contains('on')){ blackout.classList.remove('on'); return } next() }
  else if(['ArrowLeft','ArrowUp','PageUp','Backspace'].includes(k)){ e.preventDefault(); prev() }
  else if(k==='n'||k==='N') jumpTo(cur+1);
  else if(k==='p'||k==='P') jumpTo(cur-1);
  else if(k==='Home') jumpTo(0);
  else if(k==='End') jumpTo(SL.length-1);
  else if(/^[0-9]$/.test(k)) jumpTo(k==='0'?9:+k-1);
  else if(k==='b'||k==='B'||k==='.') blackout.classList.toggle('on');
  else if(k==='m'||k==='M') toggleSound();
  else if(k==='f'||k==='F') toggleFull();
  else if(k==='h'||k==='H'||k==='?') help.classList.toggle('on');
  else if(k==='Escape') help.classList.remove('on');
});
viewport.addEventListener('pointerup',e=>{ if(!started) return; if(help.classList.contains('on')){ help.classList.remove('on'); return }
  if(e.pointerType==='touch'){ (e.clientX<viewport.clientWidth*.3)?prev():next(); return } if(e.button===0) next(); else if(e.button===2) prev() });
viewport.addEventListener('contextmenu',e=>e.preventDefault());
help.addEventListener('pointerup',()=>help.classList.remove('on'));
$('#bSound').addEventListener('click',e=>{ e.stopPropagation(); toggleSound() });
$('#bFull').addEventListener('click',e=>{ e.stopPropagation(); toggleFull() });
$('#bHelp').addEventListener('click',e=>{ e.stopPropagation(); help.classList.toggle('on') });
let idleT=0; addEventListener('pointermove',()=>{ viewport.classList.remove('idle'); clearTimeout(idleT); idleT=setTimeout(()=>viewport.classList.add('idle'),2200) });

function begin(){ if(started) return; started=true; SND.init(); toggleFullIfDesktop(); $('#intro').classList.add('gone'); t0=gsap.ticker.time; SND.mood(...SL[0].mood); idleT=setTimeout(()=>viewport.classList.add('idle'),2200) }
function toggleFullIfDesktop(){ if(matchMedia('(pointer:fine)').matches && !document.fullscreenElement){ try{ document.documentElement.requestFullscreen&&document.documentElement.requestFullscreen().catch(()=>{}) }catch(e){} } }
$('#go').addEventListener('click',begin);

fit(); activate(SL[0],false); cur=0; step=0; hud();
const ready=()=>{ const b=$('#go'); b.disabled=false; b.textContent='Begin' };
Promise.race([Promise.all([document.fonts.load('900 100px "Barlow Condensed"'),document.fonts.load('italic 40px "Instrument Serif"'),document.fonts.load('500 14px "JetBrains Mono"')]),new Promise(r=>setTimeout(r,3000))]).then(ready,ready);
window.__deck={next,prev,jumpTo,get cur(){return cur},get step(){return step},SL,begin};
})();
