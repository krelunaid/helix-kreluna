import type { Locale } from "@/lib/i18n-core";
import { flagshipCopy } from "@/lib/flagships/copy";
import { escapeFlagshipMarkup, flagshipDocument, flagshipScriptData } from "@/lib/flagships/shared";

export function buildOrbitCommandHtml(locale: Locale = "en"): string {
  const copy = flagshipCopy(locale, "orbit-command");
  const ui = copy.ui;
  const text = escapeFlagshipMarkup;
  const satellites = [
    { id: "astra", name: ui.sat1, altitude: 548, inclination: 97.6, fuel: 82, phase: 0.15 },
    { id: "vega", name: ui.sat2, altitude: 612, inclination: 53.2, fuel: 64, phase: 2.35 },
    { id: "kite", name: ui.sat3, altitude: 486, inclination: 82.4, fuel: 91, phase: 4.45 },
  ];

  return flagshipDocument({
    id: "orbit-command",
    locale,
    title: copy.title,
    themeColor: "#030506",
    css: `
:root{color-scheme:dark;--ink:#030506;--panel:#080b0d;--line:#263036;--muted:#77868d;--signal:#b8ff4d;--cyan:#59e8ff;--warn:#ffb84a;--white:#f1f7f4}
body{min-height:100vh;overflow-x:hidden;background:var(--ink);color:var(--white);font-family:"Arial Narrow","Roboto Condensed",Arial,sans-serif;letter-spacing:.015em}
body::before{content:"";position:fixed;inset:0;pointer-events:none;background:linear-gradient(rgb(255 255 255/.018) 1px,transparent 1px),linear-gradient(90deg,rgb(255 255 255/.018) 1px,transparent 1px);background-size:36px 36px;mask-image:linear-gradient(to bottom,black,transparent 82%)}
.mission{position:relative;display:grid;grid-template-rows:auto minmax(540px,1fr) auto;min-height:100vh;border:1px solid var(--line)}
.command-bar{min-width:0;display:grid;grid-template-columns:minmax(210px,1fr) auto minmax(210px,1fr);align-items:center;gap:18px;padding:14px 18px;border-bottom:1px solid var(--line);background:#050708}
.identity{display:flex;align-items:center;gap:12px;min-width:0}.brand{font:800 clamp(15px,2vw,21px)/1 "Arial Narrow",Arial,sans-serif;letter-spacing:.22em;white-space:nowrap}.eyebrow{overflow:hidden;color:var(--muted);font:600 9px/1.3 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.18em;text-overflow:ellipsis;white-space:nowrap}
.link-state{display:flex;align-items:center;gap:8px;color:var(--signal);font:700 10px/1 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.16em}.pulse{width:7px;height:7px;background:var(--signal);box-shadow:0 0 16px var(--signal);animation:pulse 1.8s ease-in-out infinite}
.mission-time{text-align:right}.micro{display:block;color:var(--muted);font:700 9px/1.2 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.17em}.clock{display:block;margin-top:4px;color:var(--cyan);font:500 15px/1 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.1em}
.perimeter{display:grid;grid-template-columns:190px minmax(340px,1fr) 250px;min-height:0}
.rail{min-width:0;background:rgb(6 9 10/.94)}.fleet-rail{border-right:1px solid var(--line)}.telemetry-rail{border-left:1px solid var(--line)}
.rail-title{margin:0;padding:16px 14px 11px;border-bottom:1px solid var(--line);color:var(--muted);font:700 9px/1 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.2em}
.fleet-list{display:grid}.satellite{position:relative;display:grid;grid-template-columns:30px 1fr;gap:10px;align-items:center;width:100%;min-height:78px;padding:12px 13px;border:0;border-bottom:1px solid var(--line);background:transparent;color:var(--white);text-align:left}.satellite::before{content:"";width:19px;height:19px;border:1px solid #526067;transform:rotate(45deg)}.satellite::after{content:"";position:absolute;left:20px;width:6px;height:6px;background:#526067;transform:rotate(45deg)}.satellite:hover,.satellite:focus-visible{background:#0c1113;outline:none}.satellite.is-active{background:linear-gradient(90deg,rgb(184 255 77/.13),transparent)}.satellite.is-active::before{border-color:var(--signal);box-shadow:0 0 15px rgb(184 255 77/.25)}.satellite.is-active::after{background:var(--signal)}
.sat-name{display:block;font:700 12px/1.2 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.08em}.sat-orbit{display:block;margin-top:5px;color:var(--muted);font:500 9px/1.2 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.08em}
.viewport{position:relative;min-width:0;min-height:540px;overflow:hidden;background:radial-gradient(circle at 50% 48%,#0b161a 0,#05090b 34%,#020304 72%)}.viewport::before,.viewport::after{content:"";position:absolute;z-index:2;pointer-events:none}.viewport::before{inset:12px;border:1px solid rgb(89 232 255/.12)}.viewport::after{left:50%;top:50%;width:6px;height:6px;border:1px solid var(--cyan);transform:translate(-50%,-50%) rotate(45deg)}
#orbit-canvas{position:absolute;inset:0;width:100%;height:100%}
.layer-bank{position:absolute;z-index:3;left:22px;top:22px;display:grid;gap:6px}.layer-button,.square-button{border:1px solid #354248;background:rgb(3 5 6/.82);color:var(--muted);font:700 9px/1 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.1em}.layer-button{min-width:132px;padding:9px 10px;text-align:left}.layer-button::before{content:"+";display:inline-block;width:19px;color:#4c5a61}.layer-button.is-active{border-color:rgb(89 232 255/.55);color:var(--cyan)}.layer-button.is-active::before{content:"×";color:var(--cyan)}.layer-button:focus-visible,.square-button:focus-visible,.burn-button:focus-visible,.timeline-button:focus-visible{outline:2px solid var(--signal);outline-offset:2px}
.zoom-bank{position:absolute;z-index:3;right:22px;top:22px;display:flex}.square-button{width:38px;height:38px;font-size:18px}.square-button+ .square-button{border-left:0}.zoom-readout{position:absolute;z-index:3;right:22px;top:68px;color:var(--muted);font:700 9px/1 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.12em}
.station-tag{position:absolute;z-index:3;left:22px;bottom:22px;display:flex;align-items:center;gap:8px;color:var(--muted);font:600 9px/1 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.11em}.station-tag::before{content:"";width:9px;height:9px;border:1px solid var(--cyan);border-radius:50%;box-shadow:0 0 12px rgb(89 232 255/.35)}
.telemetry-card{padding:18px 16px;border-bottom:1px solid var(--line)}.selected-name{margin:7px 0 0;font:700 21px/.95 "Arial Narrow",Arial,sans-serif;letter-spacing:.05em}.nominal{display:inline-flex;margin-top:10px;padding:5px 7px;border:1px solid rgb(184 255 77/.35);color:var(--signal);font:700 8px/1 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.14em}
.readings{margin:0}.reading{display:grid;grid-template-columns:1fr auto;align-items:end;gap:8px;padding:15px 16px;border-bottom:1px solid var(--line)}.reading dt{color:var(--muted);font:700 9px/1 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.12em}.reading dd{margin:0;color:var(--white);font:500 15px/1 ui-monospace,SFMono-Regular,Consolas,monospace}.reading small{color:var(--muted);font-size:8px}
.burn-zone{display:grid;gap:7px;padding:16px}.burn-button{min-height:39px;border:1px solid #3a484e;background:transparent;color:var(--white);font:700 9px/1 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.13em}.burn-button.primary{border-color:var(--signal);background:var(--signal);color:#101608}.burn-button.commit{border-color:var(--warn);color:var(--warn)}.burn-button:disabled{opacity:.3}.notice{min-height:42px;margin:3px 0 0;color:var(--muted);font:500 9px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace}
.timeline{display:grid;grid-template-columns:190px 1fr 250px;align-items:center;min-height:88px;border-top:1px solid var(--line);background:#050708}.timeline-label{padding:0 14px;color:var(--muted);font:700 9px/1.35 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.17em}.timeline-track{display:grid;grid-template-columns:auto minmax(90px,1fr) auto;align-items:center;gap:14px;padding:0 22px;border-inline:1px solid var(--line)}.time-code{color:var(--cyan);font:600 10px/1 ui-monospace,SFMono-Regular,Consolas,monospace}.scrubber{width:100%;height:2px;accent-color:var(--signal)}.timeline-button{margin:0 16px;min-height:38px;border:1px solid #46545a;background:transparent;color:var(--white);font:700 9px/1 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.14em}
body.is-planning .viewport{box-shadow:inset 0 0 80px rgb(255 184 74/.08)}body.is-paused .pulse{animation:none;opacity:.45}
@keyframes pulse{50%{opacity:.3;box-shadow:0 0 4px var(--signal)}}
@media(max-width:900px){.perimeter{grid-template-columns:150px minmax(300px,1fr) 210px}.timeline{grid-template-columns:150px 1fr 210px}.command-bar{grid-template-columns:1fr auto}.link-state{display:none}.reading{padding-inline:12px}.burn-zone{padding:12px}}
@media(max-width:700px){.mission{grid-template-rows:auto auto auto}.command-bar{grid-template-columns:1fr auto;padding:12px}.eyebrow{display:none}.clock{font-size:12px}.perimeter{display:flex;flex-direction:column}.fleet-rail{order:1;border-right:0;border-bottom:1px solid var(--line)}.fleet-list{grid-template-columns:repeat(3,1fr)}.satellite{min-height:60px;border-bottom:0;border-right:1px solid var(--line);grid-template-columns:18px 1fr;padding:9px}.satellite::before{width:12px;height:12px}.satellite::after{left:13px;width:4px;height:4px}.sat-orbit{display:none}.viewport{order:2;min-height:54vh}.telemetry-rail{order:3;border-left:0;border-top:1px solid var(--line);display:grid;grid-template-columns:1fr 1fr}.telemetry-card{grid-column:1/-1}.readings{display:grid;grid-template-columns:repeat(3,1fr)}.reading{display:block;padding:12px 10px}.reading dt{margin-bottom:7px}.burn-zone{grid-column:1/-1;grid-template-columns:repeat(3,1fr)}.notice{grid-column:1/-1}.timeline{grid-template-columns:1fr auto;min-height:98px}.timeline-label{display:none}.timeline-track{border-left:0;padding:0 12px}.timeline-button{margin:0 12px 0 0}.layer-bank{left:12px;top:12px}.layer-button{min-width:0;width:112px}.zoom-bank{right:12px;top:12px}.zoom-readout{right:12px;top:58px}.station-tag{left:12px;bottom:12px;max-width:65%}}
@media(max-width:440px){.brand{font-size:13px}.mission-time .micro{display:none}.viewport{min-height:440px}.layer-button{padding:8px;width:100px;font-size:8px}.telemetry-rail{grid-template-columns:1fr}.readings{grid-template-columns:1fr 1fr 1fr}.burn-zone{grid-template-columns:1fr}.timeline-track{grid-template-columns:1fr}.timeline-track .time-code:last-child{display:none}.timeline-button{width:76px}.station-tag{font-size:8px}}
`,
    body: `
<main class="mission" aria-label="${text(copy.title)}">
  <header class="command-bar">
    <div class="identity"><span class="brand">${text(copy.brand)}</span><span class="eyebrow">${text(ui.eyebrow)}</span></div>
    <div class="link-state"><span class="pulse" aria-hidden="true"></span>${text(ui.live)}</div>
    <div class="mission-time"><span class="micro">${text(ui.missionTime)}</span><time class="clock" id="mission-clock">T+ 042:17:08</time></div>
  </header>
  <section class="perimeter">
    <aside class="rail fleet-rail" aria-labelledby="fleet-title">
      <h2 class="rail-title" id="fleet-title">${text(ui.fleet)}</h2>
      <div class="fleet-list">
        ${satellites
          .map(
            (satellite, index) =>
              `<button type="button" class="satellite${index === 0 ? " is-active" : ""}" data-action="select-satellite" data-satellite="${satellite.id}" aria-pressed="${index === 0 ? "true" : "false"}" aria-label="${text(`${ui.selected}: ${satellite.name}`)}"><span><span class="sat-name">${text(satellite.name)}</span><span class="sat-orbit">LEO ${satellite.altitude} KM</span></span></button>`,
          )
          .join("")}
      </div>
    </aside>
    <section class="viewport" aria-label="${text(copy.capability)}">
      <canvas id="orbit-canvas" role="img" aria-label="${text(copy.title)}"></canvas>
      <div class="layer-bank" aria-label="${text(ui.telemetry)}">
        <button type="button" class="layer-button is-active" data-action="toggle-layer" data-layer="paths" aria-pressed="true">${text(ui.paths)}</button>
        <button type="button" class="layer-button is-active" data-action="toggle-layer" data-layer="ground" aria-pressed="true">${text(ui.ground)}</button>
        <button type="button" class="layer-button" data-action="toggle-layer" data-layer="debris" aria-pressed="false">${text(ui.debris)}</button>
      </div>
      <div class="zoom-bank" aria-label="${text(copy.title)}">
        <button type="button" class="square-button" data-action="zoom-in" aria-label="${text(ui.zoomIn)}">+</button>
        <button type="button" class="square-button" data-action="zoom-out" aria-label="${text(ui.zoomOut)}">−</button>
      </div>
      <output class="zoom-readout" id="zoom-readout">100%</output>
      <div class="station-tag">${text(ui.station)}</div>
    </section>
    <aside class="rail telemetry-rail" aria-labelledby="telemetry-title">
      <h2 class="rail-title" id="telemetry-title">${text(ui.telemetry)}</h2>
      <div class="telemetry-card"><span class="micro">${text(ui.selected)}</span><p class="selected-name" id="selected-name">${text(satellites[0].name)}</p><span class="nominal" id="nominal-state">${text(ui.nominal)}</span></div>
      <dl class="readings">
        <div class="reading"><dt>${text(ui.altitude)}</dt><dd><span id="altitude-value">${satellites[0].altitude}</span> <small>KM</small></dd></div>
        <div class="reading"><dt>${text(ui.inclination)}</dt><dd><span id="inclination-value">${satellites[0].inclination.toFixed(1)}</span><small>°</small></dd></div>
        <div class="reading"><dt>${text(ui.fuel)}</dt><dd><span id="fuel-value">${satellites[0].fuel}</span><small>%</small></dd></div>
        <div class="reading"><dt>${text(ui.contact)}</dt><dd><span id="contact-value">06:42</span></dd></div>
      </dl>
      <div class="burn-zone">
        <button type="button" class="burn-button primary" data-action="plan-burn" aria-label="${text(ui.plan)}">${text(ui.plan)}</button>
        <button type="button" class="burn-button commit" data-action="commit-burn" aria-label="${text(ui.commit)}" disabled>${text(ui.commit)}</button>
        <button type="button" class="burn-button" data-action="cancel-burn" aria-label="${text(ui.cancel)}" disabled>${text(ui.cancel)}</button>
        <p class="notice" id="mission-notice" aria-live="polite">${text(ui.nominal)} · ${text(ui.station)}</p>
      </div>
    </aside>
  </section>
  <footer class="timeline">
    <div class="timeline-label">${text(ui.timeline)}</div>
    <div class="timeline-track">
      <output class="time-code" id="time-code">T+00</output>
      <input class="scrubber" id="time-scrubber" data-action="time-scrub" type="range" min="0" max="100" value="24" aria-label="${text(ui.timeline)}">
      <output class="time-code" id="contact-code">LOS 06:42</output>
    </div>
    <button type="button" class="timeline-button" data-action="pause-orbit" aria-pressed="false" aria-label="${text(ui.pause)}">${text(ui.pause)}</button>
  </footer>
</main>`,
    script: `
const model=${flagshipScriptData({ satellites, ui })};
const canvas=document.getElementById("orbit-canvas");
const context=canvas.getContext("2d");
const state={selected:"astra",layers:{paths:true,ground:true,debris:false},zoom:1,time:24,running:true,planning:false,angle:0};
const byId=(id)=>document.getElementById(id);
const selectedSatellite=()=>model.satellites.find((satellite)=>satellite.id===state.selected);
function setNotice(value){byId("mission-notice").textContent=value;}
function resizeCanvas(){
  const ratio=Math.min(devicePixelRatio||1,2);
  const width=Math.max(1,canvas.clientWidth);
  const height=Math.max(1,canvas.clientHeight);
  canvas.width=Math.round(width*ratio);
  canvas.height=Math.round(height*ratio);
  context.setTransform(ratio,0,0,ratio,0,0);
  draw();
}
function orbitPoint(cx,cy,rx,ry,angle,tilt){
  const x=Math.cos(angle)*rx;
  const y=Math.sin(angle)*ry;
  return {x:cx+x*Math.cos(tilt)-y*Math.sin(tilt),y:cy+x*Math.sin(tilt)+y*Math.cos(tilt)};
}
function drawEarth(cx,cy,radius){
  const gradient=context.createRadialGradient(cx-radius*.35,cy-radius*.38,radius*.08,cx,cy,radius);
  gradient.addColorStop(0,"#203a42");gradient.addColorStop(.58,"#0d2229");gradient.addColorStop(1,"#020506");
  context.fillStyle=gradient;context.beginPath();context.arc(cx,cy,radius,0,Math.PI*2);context.fill();
  context.save();context.beginPath();context.arc(cx,cy,radius,0,Math.PI*2);context.clip();
  context.strokeStyle="rgba(89,232,255,.16)";context.lineWidth=1;
  for(let index=-3;index<=3;index+=1){context.beginPath();context.ellipse(cx,cy+index*radius*.22,radius*Math.sqrt(Math.max(.08,1-index*index/16)),radius*.08,0,0,Math.PI*2);context.stroke();}
  for(let index=0;index<6;index+=1){context.beginPath();context.ellipse(cx,cy,radius*.25,radius,index*Math.PI/6,0,Math.PI*2);context.stroke();}
  context.restore();context.strokeStyle="rgba(89,232,255,.34)";context.stroke();
}
function draw(){
  if(!context)return;
  const width=canvas.clientWidth,height=canvas.clientHeight;
  context.clearRect(0,0,width,height);
  const cx=width*.52,cy=height*.52;
  const earthRadius=Math.min(width,height)*.18*state.zoom;
  drawEarth(cx,cy,earthRadius);
  const scale=state.zoom;
  model.satellites.forEach((satellite,index)=>{
    const rx=earthRadius*(1.68+index*.28),ry=rx*.44,tilt=(-.34+index*.31);
    if(state.layers.paths){context.strokeStyle=satellite.id===state.selected?"rgba(184,255,77,.8)":"rgba(89,232,255,.24)";context.lineWidth=satellite.id===state.selected?1.5:1;context.beginPath();context.ellipse(cx,cy,rx,ry,tilt,0,Math.PI*2);context.stroke();}
    const point=orbitPoint(cx,cy,rx,ry,state.angle*(.72+index*.12)+satellite.phase+state.time*.025,tilt);
    context.fillStyle=satellite.id===state.selected?"#b8ff4d":"#59e8ff";context.fillRect(point.x-3,point.y-3,6,6);
    if(satellite.id===state.selected){context.strokeStyle="rgba(184,255,77,.55)";context.strokeRect(point.x-8,point.y-8,16,16);context.fillStyle="#b8ff4d";context.font="10px ui-monospace,monospace";context.fillText(satellite.name.toUpperCase(),point.x+13,point.y+4);}
    if(state.layers.ground){context.strokeStyle="rgba(89,232,255,.16)";context.setLineDash([3,5]);context.beginPath();context.moveTo(point.x,point.y);context.lineTo(cx+(point.x-cx)*.28,cy+(point.y-cy)*.28);context.stroke();context.setLineDash([]);}
  });
  if(state.layers.debris){
    context.fillStyle="rgba(255,184,74,.72)";
    for(let index=0;index<24;index+=1){const angle=index*.93;const distance=earthRadius*(1.25+(index%7)*.17);context.fillRect(cx+Math.cos(angle)*distance,cy+Math.sin(angle)*distance*.48,1.5,1.5);}
  }
  if(state.planning){context.strokeStyle="#ffb84a";context.lineWidth=2;context.setLineDash([7,6]);context.beginPath();context.arc(cx,cy,earthRadius*2.45,-1.25,-.2);context.stroke();context.setLineDash([]);}
}
function syncTelemetry(){
  const satellite=selectedSatellite();
  byId("selected-name").textContent=satellite.name;
  byId("altitude-value").textContent=String(satellite.altitude);
  byId("inclination-value").textContent=satellite.inclination.toFixed(1);
  byId("fuel-value").textContent=String(satellite.fuel);
  byId("contact-value").textContent=String(Math.max(1,9-Math.round(state.time/16))).padStart(2,"0")+":"+String((42+state.time)%60).padStart(2,"0");
  document.querySelectorAll('[data-action="select-satellite"]').forEach((button)=>{const active=button.getAttribute("data-satellite")===state.selected;button.classList.toggle("is-active",active);button.setAttribute("aria-pressed",String(active));});
}
function syncPlanButtons(){
  document.body.classList.toggle("is-planning",state.planning);
  document.querySelector('[data-action="plan-burn"]').disabled=state.planning;
  document.querySelector('[data-action="commit-burn"]').disabled=!state.planning;
  document.querySelector('[data-action="cancel-burn"]').disabled=!state.planning;
}
function handleControl(control){
  const action=control.getAttribute("data-action");
  if(action==="select-satellite"){
    state.selected=control.getAttribute("data-satellite");state.planning=false;syncTelemetry();syncPlanButtons();setNotice(model.ui.selected+": "+selectedSatellite().name);draw();
  }else if(action==="toggle-layer"){
    const layer=control.getAttribute("data-layer");state.layers[layer]=!state.layers[layer];control.classList.toggle("is-active",state.layers[layer]);control.setAttribute("aria-pressed",String(state.layers[layer]));setNotice(control.textContent+" · "+(state.layers[layer]?"ON":"OFF"));draw();
  }else if(action==="zoom-in"||action==="zoom-out"){
    state.zoom=Math.max(.72,Math.min(1.42,state.zoom+(action==="zoom-in"?.12:-.12)));byId("zoom-readout").textContent=Math.round(state.zoom*100)+"%";setNotice(control.getAttribute("aria-label")+" · "+byId("zoom-readout").textContent);draw();
  }else if(action==="plan-burn"){
    state.planning=true;syncPlanButtons();setNotice(model.ui.noticePlan);draw();
  }else if(action==="commit-burn"){
    const satellite=selectedSatellite();satellite.altitude+=12;satellite.fuel=Math.max(0,satellite.fuel-3);state.planning=false;syncTelemetry();syncPlanButtons();setNotice(model.ui.noticeCommitted);draw();
  }else if(action==="cancel-burn"){
    state.planning=false;syncPlanButtons();setNotice(model.ui.noticeCancelled);draw();
  }else if(action==="pause-orbit"){
    state.running=!state.running;control.textContent=state.running?model.ui.pause:model.ui.resume;control.setAttribute("aria-label",control.textContent);control.setAttribute("aria-pressed",String(!state.running));document.body.classList.toggle("is-paused",!state.running);setNotice(control.textContent);draw();
  }else if(action==="time-scrub"){
    state.time=Number(control.value);byId("time-code").textContent="T+"+String(state.time).padStart(2,"0");byId("contact-code").textContent="LOS "+String(Math.max(1,9-Math.round(state.time/16))).padStart(2,"0")+":"+String((42+state.time)%60).padStart(2,"0");byId("mission-clock").textContent="T+ 042:"+String(17+Math.floor(state.time/10)).padStart(2,"0")+":"+String(state.time%60).padStart(2,"0");syncTelemetry();setNotice(model.ui.timeline+" · "+byId("time-code").textContent);draw();
  }
}
document.querySelectorAll("[data-action]").forEach((control)=>{control.addEventListener(control.matches('input[type="range"]')?"input":"click",()=>handleControl(control));});
let previous=0;
function animate(time){if(state.running&&time-previous>32){state.angle+=.006;previous=time;draw();}requestAnimationFrame(animate);}
addEventListener("resize",resizeCanvas);
syncTelemetry();syncPlanButtons();resizeCanvas();requestAnimationFrame(animate);
`,
  });
}
