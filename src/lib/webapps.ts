/** Standalone English product UIs — no nested window chrome. */

function page(title: string, css: string, body: string, script: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&family=Syne:wght@600;700&display=swap"/>
<style>
*{box-sizing:border-box} html,body{margin:0;height:100%;background:#07080c;color:#e8eaef}
body{font-family:"IBM Plex Sans",system-ui,sans-serif;font-size:13px}
button,select,input{font:inherit;color:inherit;cursor:pointer}
button:disabled{opacity:.4;cursor:default}
${css}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style>
</head>
<body>${body}<script>${script}</script></body></html>`;
}

export function buildSonarHtml() {
  return page(
    "Sonar",
    `
    body{display:grid;grid-template-rows:52px 1fr 28px}
    header{display:flex;align-items:center;gap:10px;padding:0 14px;background:#0d0f16;border-bottom:1px solid #1c2230}
    .mark{font-family:Syne,sans-serif;font-weight:700;letter-spacing:.08em;font-size:14px}
    .live{width:7px;height:7px;border-radius:50%;background:#34d399;box-shadow:0 0 8px #34d399}
    nav{display:flex;gap:6px;flex-wrap:wrap}
    nav button, nav select{height:32px;padding:0 10px;border:1px solid #243044;background:#141824;border-radius:8px}
    nav button.g{background:#e8eaef;color:#07080c;border-color:transparent;font-weight:600}
    .sp{flex:1}
    .clk{font-family:"IBM Plex Mono",monospace;color:#8b95a7}
    .app{display:grid;grid-template-columns:240px 1fr 268px;min-height:0}
    aside, .ins{background:#0d0f16;overflow:auto;padding:12px;border-right:1px solid #1c2230}
    .ins{border-right:0;border-left:1px solid #1c2230}
    h2{margin:0 0 10px;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#6d7789}
    .cell{display:grid;gap:2px;width:100%;text-align:left;margin:0 0 7px;padding:10px 11px;border:1px solid #243044;background:#12151e;border-radius:10px}
    .cell.on{border-color:#94a3b8}
    .tag{font-size:10px;letter-spacing:.06em}
    .tag.w{color:#fca5a5}.tag.a{color:#fcd34d}
    canvas{display:block;width:100%;height:100%;background:#05060a}
    .stage{position:relative;min-height:0}
    .legend{position:absolute;left:12px;bottom:12px;display:flex;gap:8px;align-items:center;font-family:"IBM Plex Mono",monospace;font-size:10px;color:#8b95a7}
    .bar{width:88px;height:6px;border-radius:99px;background:linear-gradient(90deg,#22c55e,#eab308,#ef4444)}
    .row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #1c2230;font-family:"IBM Plex Mono",monospace}
    .ins button{margin-top:12px;width:100%;height:36px;border:0;border-radius:8px;background:#e8eaef;color:#07080c;font-weight:600}
    foot{display:flex;align-items:center;gap:14px;padding:0 14px;background:#0d0f16;border-top:1px solid #1c2230;color:#6d7789;font-family:"IBM Plex Mono",monospace;font-size:11px}
    @media(max-width:820px){.app{grid-template-columns:1fr} aside,.ins{max-height:34vh}}
    `,
    `
    <header>
      <span class="live"></span><span class="mark">SONAR</span>
      <span style="color:#6d7789">Tornado operations</span>
      <div class="sp"></div>
      <nav>
        <button class="g" id="scan">Scan</button>
        <button id="warn">Warnings</button>
        <button id="watch">Watches</button>
        <button id="all">All cells</button>
        <select id="rng"><option>250 km</option><option>120 km</option><option>60 km</option></select>
        <button id="vel">Velocity</button>
        <button id="ref">Reflectivity</button>
        <button id="pause">Pause</button>
      </nav>
      <span class="clk" id="clock"></span>
    </header>
    <div class="app">
      <aside id="list"></aside>
      <div class="stage"><canvas id="cv"></canvas><div class="legend"><span>dBZ</span><i class="bar"></i><span>65+</span></div></div>
      <div class="ins" id="ins"><h2>Sounding</h2><p style="color:#8b95a7">Select a cell. Risk is CAPE × shear × mesocyclone rotation.</p></div>
    </div>
    <foot><span>NWS / SPC mesoscale</span><span id="mode">Reflectivity</span><span id="st">4 cells</span><span class="sp"></span><span>KTLX 0.5°</span></foot>
    `,
    `
    const S=[
      {id:'A',n:'OKC supercell',x:.62,y:.34,sev:'w',cape:4120,sh:58,rot:.92,hail:2.4,wind:74,p:91,loc:'Moore, OK'},
      {id:'B',n:'Wichita line',x:.32,y:.42,sev:'a',cape:2800,sh:41,rot:.44,hail:1.0,wind:52,p:38,loc:'Wichita, KS'},
      {id:'C',n:'Tulsa hook',x:.74,y:.52,sev:'w',cape:3600,sh:62,rot:.81,hail:1.75,wind:68,p:77,loc:'Tulsa, OK'},
      {id:'D',n:'Amarillo',x:.18,y:.64,sev:'a',cape:1900,sh:28,rot:.21,hail:0.5,wind:40,p:12,loc:'Amarillo, TX'}
    ];
    let f='all', sel='A', ang=0, run=true, mode='Reflectivity';
    const cv=document.getElementById('cv'), ctx=cv.getContext('2d');
    function vis(){return S.filter(s=>f==='all'||(f==='w'&&s.sev==='w')||(f==='a'&&s.sev==='a'))}
    function list(){
      document.getElementById('list').innerHTML='<h2>Active cells</h2>'+vis().map(s=>'<button class="cell '+(sel===s.id?'on':'')+'" data-id="'+s.id+'"><b>'+s.n+'</b><span style="color:#8b95a7">'+s.loc+' · TOR '+s.p+'%</span><span class="tag '+(s.sev==='w'?'w':'a')+'">'+(s.sev==='w'?'TORNADO WARNING':'TORNADO WATCH')+'</span></button>').join('');
      document.querySelectorAll('.cell').forEach(b=>b.onclick=()=>open(b.dataset.id));
      st.textContent=vis().length+' cells · live';
    }
    function open(id){
      const s=S.find(x=>x.id===id); sel=id;
      ins.innerHTML='<h2>'+s.n+'</h2>'+[['Site',s.loc],['CAPE',s.cape+' J/kg'],['0–6 km shear',s.sh+' kt'],['Rotation',Math.round(s.rot*100)+'%'],['Hail',s.hail+' in'],['Wind',s.wind+' mph'],['Tornado prob',s.p+'%']].map(r=>'<div class="row"><span>'+r[0]+'</span><b>'+r[1]+'</b></div>').join('')+'<button id="trk">Track this cell</button><p id="note" style="color:#8b95a7;margin-top:8px"></p>';
      document.getElementById('trk').onclick=()=>{note.textContent='Locked on '+s.loc+' · next volume 41s'};
      list();
    }
    function fit(){cv.width=cv.clientWidth*devicePixelRatio; cv.height=cv.clientHeight*devicePixelRatio; ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0)}
    function blob(x,y,r,c){const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,c);g.addColorStop(1,'transparent');ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,6.28);ctx.fill()}
    function draw(){
      const w=cv.clientWidth,h=cv.clientHeight; if(!w) return;
      ctx.fillStyle='#05060a'; ctx.fillRect(0,0,w,h);
      const cx=w/2,cy=h*.54, R=Math.min(w,h)*.42;
      ctx.strokeStyle='#1c2230'; ctx.lineWidth=1;
      [1,.66,.33].forEach(k=>{ctx.beginPath();ctx.arc(cx,cy,R*k,0,6.28);ctx.stroke()});
      ctx.beginPath();ctx.moveTo(cx-R,cy);ctx.lineTo(cx+R,cy);ctx.moveTo(cx,cy-R);ctx.lineTo(cx,cy+R);ctx.stroke();
      vis().forEach(s=>{
        const x=cx+(s.x-.5)*R*2.1, y=cy+(s.y-.5)*R*2.1;
        blob(x,y, s.sev==='w'?38:26, s.sev==='w'?'rgba(239,68,68,.55)':'rgba(234,179,8,.45)');
        blob(x,y,12,'rgba(255,255,255,.35)');
        if(sel===s.id){ctx.strokeStyle='#e8eaef';ctx.beginPath();ctx.arc(x,y,16,0,6.28);ctx.stroke()}
      });
      ctx.save(); ctx.translate(cx,cy); ctx.rotate(ang);
      const sg=ctx.createLinearGradient(0,-R,R*.7,0); sg.addColorStop(0,'rgba(148,163,184,.28)'); sg.addColorStop(1,'transparent');
      ctx.fillStyle=sg; ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0,R,-Math.PI/2,-Math.PI/2+.7); ctx.fill(); ctx.restore();
    }
    function loop(){ if(run) ang+=0.018; draw(); requestAnimationFrame(loop) }
    function tick(){clock.textContent=new Date().toISOString().slice(11,19)+'Z'}
    addEventListener('resize',()=>{fit();draw()});
    fit(); tick(); setInterval(tick,1000); open('A'); loop();
    scan.onclick=()=>{f='all';list();};
    all.onclick=()=>{f='all';list();};
    warn.onclick=()=>{f='w';list();};
    watch.onclick=()=>{f='a';list();};
    vel.onclick=()=>{mode.textContent='Velocity'};
    ref.onclick=()=>{mode.textContent='Reflectivity'};
    pause.onclick=()=>{run=!run; pause.textContent=run?'Pause':'Resume'};
    `,
  );
}

export function buildMixlabHtml() {
  return page(
    "Mixlab",
    `
    body{display:grid;grid-template-rows:52px 1fr 28px}
    header{display:flex;align-items:center;gap:10px;padding:0 14px;background:#0c0c10;border-bottom:1px solid #22232c}
    .mark{font-family:Syne,sans-serif;font-weight:700}
    nav{display:flex;gap:6px;flex-wrap:wrap;margin-left:auto}
    nav button,nav select{height:32px;padding:0 10px;border:1px solid #2a2b36;background:#14141a;border-radius:8px}
    nav button.g{background:#e7e5e4;color:#0c0c10;border:0;font-weight:600}
    .app{display:grid;grid-template-columns:200px 1fr 240px;min-height:0}
    aside,.side{background:#0c0c10;padding:12px;overflow:auto;border-right:1px solid #22232c}
    .side{border-right:0;border-left:1px solid #22232c}
    h2{margin:4px 0 8px;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#737484}
    .t{display:block;width:100%;text-align:left;margin:0 0 6px;padding:10px;border:1px solid #2a2b36;background:#14141a;border-radius:10px}
    .t.on{border-color:#e7e5e4}
    .deck{display:grid;grid-template-rows:1fr auto auto;min-height:0;padding:16px;gap:12px}
    canvas{width:100%;height:100%;display:block;background:#08080c;border-radius:12px}
    .meta{display:flex;justify-content:space-between;align-items:end}
    .meta b{font-family:Syne,sans-serif;font-size:22px}
    input[type=range]{width:100%;accent-color:#e7e5e4}
    .vote{display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #22232c}
    .vote button{height:28px;padding:0 8px;border:1px solid #2a2b36;background:#14141a;border-radius:6px}
    foot{display:flex;gap:14px;align-items:center;padding:0 14px;border-top:1px solid #22232c;background:#0c0c10;color:#737484;font-family:"IBM Plex Mono",monospace;font-size:11px}
    .sp{flex:1}
    @media(max-width:820px){.app{grid-template-columns:1fr}}
    `,
    `
    <header>
      <span class="mark">MIXLAB</span>
      <span style="color:#737484">Auto remix · crowd votes</span>
      <nav>
        <button class="g" id="remix">Auto remix</button>
        <button id="play">Play</button>
        <button id="stop">Stop</button>
        <button id="cue">Cue</button>
        <select id="bpm"><option>Match BPM</option><option>122</option><option>128</option><option>132</option></select>
        <button id="sync">Sync</button>
        <button id="save">Save</button>
        <button id="share">Share</button>
      </nav>
    </header>
    <div class="app">
      <aside>
        <h2>Deck A</h2>
        <button class="t on" data-a="Night Drive">Night Drive</button>
        <button class="t" data-a="Velvet Low">Velvet Low</button>
        <button class="t" data-a="Red Room">Red Room</button>
        <h2>Deck B</h2>
        <button class="t on" data-b="City Heat">City Heat</button>
        <button class="t" data-b="Glass">Glass</button>
        <button class="t" data-b="Siren">Siren</button>
      </aside>
      <div class="deck">
        <canvas id="wf"></canvas>
        <div class="meta"><div><b id="title">Night Drive × City Heat</b><div id="sub" style="color:#737484">128 BPM · stopped</div></div><span id="xfv" style="font-family:IBM Plex Mono,monospace">XF 50</span></div>
        <input id="xf" type="range" min="0" max="100" value="50"/>
      </div>
      <div class="side"><h2>Crowd chart</h2><div id="chart"></div></div>
    </div>
    <foot><span>Mixlab</span><span id="st">ready</span><span class="sp"></span><span>stems live</span></foot>
    `,
    `
    let A='Night Drive',B='City Heat',on=false,t=0;
    const mixes=[{n:'Night Drive × City Heat',v:42},{n:'Velvet Low × Glass',v:31},{n:'Red Room × Siren',v:19}];
    const wf=document.getElementById('wf'), ctx=wf.getContext('2d');
    document.querySelectorAll('[data-a]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-a]').forEach(x=>x.classList.remove('on'));b.classList.add('on');A=b.dataset.a});
    document.querySelectorAll('[data-b]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-b]').forEach(x=>x.classList.remove('on'));b.classList.add('on');B=b.dataset.b});
    const chartEl=document.getElementById('chart');
    function chart(){
      mixes.sort((a,b)=>b.v-a.v);
      chartEl.innerHTML=mixes.map(m=>'<div class="vote"><span>'+m.n+'</span><span><b>'+m.v+'</b> <button data-v="'+m.n+'">Vote</button></span></div>').join('');
      chartEl.querySelectorAll('[data-v]').forEach(b=>b.onclick=()=>{mixes.find(m=>m.n===b.dataset.v).v++;chart()});
    }
    chart();
    function fit(){wf.width=wf.clientWidth*devicePixelRatio;wf.height=wf.clientHeight*devicePixelRatio;ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0)}
    function wave(){
      const w=wf.clientWidth,h=wf.clientHeight; if(!w) return;
      ctx.fillStyle='#08080c'; ctx.fillRect(0,0,w,h);
      const n=64, bw=w/n;
      for(let i=0;i<n;i++){
        const v=on? (.2+Math.abs(Math.sin(t*.08+i*.28))*0.75) : .18+((i*17)%10)/40;
        const bh=v*(h-16);
        ctx.fillStyle=i/n*100 < xf.value ? '#e7e5e4' : '#3f3f46';
        ctx.fillRect(i*bw+1, (h-bh)/2, Math.max(2,bw-3), bh);
      }
    }
    function loop(){ if(on) t++; wave(); requestAnimationFrame(loop)}
    addEventListener('resize',()=>{fit();wave()}); fit(); loop();
    xf.oninput=()=>{xfv.textContent='XF '+xf.value};
    remix.onclick=()=>{const n=A+' × '+B; title.textContent=n; sub.textContent=(bpm.value.match(/\\d+/)||['128'])[0]+' BPM · auto mix'; if(!mixes.find(m=>m.n===n)) mixes.push({n,v:1}); chart(); st.textContent='remix written'};
    play.onclick=()=>{on=true; sub.textContent='playing'; play.textContent='Pause'};
    stop.onclick=()=>{on=false; sub.textContent='stopped'; play.textContent='Play'};
    cue.onclick=()=>{st.textContent='cued 0:00'};
    sync.onclick=()=>{st.textContent='decks synced'};
    save.onclick=()=>{st.textContent='mix saved'};
    share.onclick=()=>{st.textContent='link copied'};
    `,
  );
}

export function buildActstageHtml() {
  return page(
    "Actstage",
    `
    body{display:grid;grid-template-rows:52px 1fr 28px;background:#0c0b0a;color:#f3eee6}
    header{display:flex;align-items:center;gap:10px;padding:0 16px;background:#141210;border-bottom:1px solid #2a261f}
    .mark{font-family:Syne,sans-serif;font-weight:700;font-size:18px}
    nav{display:flex;gap:6px;flex-wrap:wrap;margin-left:auto}
    nav button{height:32px;padding:0 10px;border:1px solid #3a342c;background:#1c1916;border-radius:8px}
    nav button.g{background:#e8d5a3;color:#1a1408;border:0;font-weight:600}
    .app{display:grid;grid-template-columns:1fr 300px;min-height:0}
    main{padding:18px 20px;overflow:auto}
    .hero{height:160px;border-radius:16px;background:#1a1814 center/cover;margin-bottom:16px;display:flex;align-items:end;padding:16px}
    h1{font-family:Syne,sans-serif;font-size:28px;margin:0}
    .acts{display:grid;gap:8px;margin:14px 0}
    .act{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;padding:12px;border:1px solid #2a261f;background:#161410;border-radius:12px;text-align:left}
    .act.on{border-color:#e8d5a3}
    .label{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#8a8378;text-align:center}
    .house{display:grid;grid-template-columns:repeat(8,30px);gap:7px;justify-content:center;margin:10px 0 18px}
    .seat{width:30px;height:30px;border-radius:7px;border:1px solid #3a342c;background:#1c1916;color:#8a8378;font-size:10px}
    .seat.ok{background:#e8d5a3;color:#1a1408;border-color:transparent}
    .seat.busy{background:#2a261f;color:#2a261f}
    .side{border-left:1px solid #2a261f;background:#141210;padding:16px;overflow:auto}
    .side button{width:100%;height:38px;margin-top:8px;border-radius:9px}
    .pri{border:0;background:#e8d5a3;color:#1a1408;font-weight:600}
    .ghost{border:1px solid #3a342c;background:transparent}
    foot{display:flex;gap:14px;align-items:center;padding:0 16px;border-top:1px solid #2a261f;background:#141210;color:#8a8378;font-family:"IBM Plex Mono",monospace;font-size:11px}
    .sp{flex:1}
    @media(max-width:800px){.app{grid-template-columns:1fr}}
    `,
    `
    <header>
      <span class="mark">Actstage</span>
      <span style="color:#8a8378">Tonight · Soho house</span>
      <nav>
        <button class="g" id="book">Hold seat</button>
        <button id="vote">Vote act</button>
        <button id="prev">Previous</button>
        <button id="next">Next act</button>
        <button id="doors">Open doors</button>
        <button id="lights">House lights</button>
        <button id="int">Intermission</button>
        <button id="print">Print tickets</button>
      </nav>
    </header>
    <div class="app">
      <main>
        <div class="hero" style="background-image:linear-gradient(#0000,#0c0b0acc),url('https://images.unsplash.com/photo-1507676184212-d03ab45efd58?auto=format&fit=crop&w=1400&q=70')">
          <h1>Three acts. One room.</h1>
        </div>
        <div class="acts" id="actList"></div>
        <p class="label">Stage</p>
        <div class="house" id="house"></div>
      </main>
      <div class="side">
        <h2 id="who" style="font-family:Syne,sans-serif;font-size:22px;margin:0 0 6px">Select</h2>
        <p id="bio" style="color:#8a8378">48 seats. Sold seats stay dark.</p>
        <button class="pri" id="hold">Hold this seat</button>
        <button class="ghost" id="vote2">Vote this act</button>
        <p id="msg" style="color:#8a8378;margin-top:10px"></p>
        <div id="board"></div>
      </div>
    </div>
    <foot><span>Actstage</span><span id="st">doors closed</span><span id="lx">LX 1</span><span class="sp"></span><span>house 48</span></foot>
    `,
    `
    const acts=[{n:'Noa Vale',t:'Voice · 21:00',v:18,bio:'One mic. No click.'},{n:'Brick & Wire',t:'Duo · 21:40',v:11,bio:'Guitar, drum machine.'},{n:'Kite Room',t:'DJ · 22:20',v:24,bio:'Two decks. Close the night.'}];
    let cur=0,seat=null; const taken=new Set([3,7,12,19,22,30,33,41]);
    const actList=document.getElementById('actList');
    function actsUI(){
      actList.innerHTML=acts.map((a,i)=>'<button class="act '+(i===cur?'on':'')+'" data-i="'+i+'"><span><b>'+a.n+'</b><br><span style="color:#8a8378">'+a.t+'</span></span><b>'+a.v+' votes</b></button>').join('');
      actList.querySelectorAll('.act').forEach(b=>b.onclick=()=>{cur=+b.dataset.i;render()});
    }
    function houseUI(){
      house.innerHTML=Array.from({length:48},(_,i)=>'<button class="seat '+(taken.has(i)?'busy':seat===i?'ok':'')+'" data-s="'+i+'">'+(i+1)+'</button>').join('');
      house.querySelectorAll('.seat').forEach(b=>{if(b.classList.contains('busy'))return;b.onclick=()=>{seat=+b.dataset.s;houseUI()}});
    }
    function render(){
      const a=acts[cur]; who.textContent=a.n; bio.textContent=a.bio+' · '+a.t;
      board.innerHTML=acts.slice().sort((x,y)=>y.v-x.v).map(x=>'<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #2a261f"><span>'+x.n+'</span><b>'+x.v+'</b></div>').join('');
      actsUI(); houseUI();
    }
    function holdSeat(){if(seat==null){msg.textContent='Pick a seat.';return;} taken.add(seat); msg.textContent='Seat '+(seat+1)+' held for '+acts[cur].n+'.'; seat=null; houseUI(); st.textContent='1 hold'}
    function voteAct(){acts[cur].v++; msg.textContent='Vote in for '+acts[cur].n; render()}
    book.onclick=holdSeat; hold.onclick=holdSeat; vote.onclick=voteAct; vote2.onclick=voteAct;
    next.onclick=()=>{cur=(cur+1)%3;render()}; prev.onclick=()=>{cur=(cur+2)%3;render()};
    doors.onclick=()=>{st.textContent='doors open'}; lights.onclick=()=>{lx.textContent=lx.textContent==='LX 1'?'LX 2':'LX 1'};
    int.onclick=()=>{st.textContent='intermission'}; print.onclick=()=>{st.textContent='tickets printed'};
    render();
    `,
  );
}
