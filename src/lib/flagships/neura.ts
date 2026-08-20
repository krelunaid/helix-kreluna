import type { Locale } from "@/lib/i18n-core";
import { flagshipCopy } from "@/lib/flagships/copy";
import {
  escapeFlagshipMarkup,
  flagshipDocument,
  flagshipScriptData,
} from "@/lib/flagships/shared";

export function buildNeuraHtml(locale: Locale): string {
  const copy = flagshipCopy(locale, "neura");
  const ui = copy.ui;
  const text = (key: string) => escapeFlagshipMarkup(ui[key] ?? "");

  return flagshipDocument({
    id: "neura",
    locale,
    title: copy.title,
    themeColor: "#f2f6f0",
    css: `
:root{
  color-scheme:light;
  --paper:#f2f6f0;
  --sheet:#fbfcf8;
  --ink:#11231f;
  --muted:#66736d;
  --line:#cad5ce;
  --mint:#20c997;
  --mint-soft:#d7f4e9;
  --coral:#f06f5f;
  --violet:#6957d9;
  --acid:#d9f27c;
}
body{
  min-height:100vh;
  overflow-x:hidden;
  background:
    linear-gradient(90deg,transparent 0 49.9%,rgb(17 35 31/.025) 50% 50.1%,transparent 50.2%),
    var(--paper);
  color:var(--ink);
  font-family:Optima,Candara,"Segoe UI",sans-serif;
  letter-spacing:-.01em;
}
button{color:inherit}
.app{min-height:100vh;display:grid;grid-template-rows:auto 1fr}
.topbar{
  min-height:76px;
  display:grid;
  grid-template-columns:minmax(210px,.85fr) minmax(360px,1.35fr) auto;
  align-items:stretch;
  border-bottom:1px solid var(--ink);
  background:var(--sheet);
}
.identity{display:flex;align-items:center;gap:14px;padding:14px 20px;border-right:1px solid var(--ink)}
.sigil{width:34px;height:34px;position:relative;display:grid;place-items:center;border:1px solid var(--ink);border-radius:50%}
.sigil::before,.sigil::after{content:"";position:absolute;background:var(--ink)}
.sigil::before{width:22px;height:1px;transform:rotate(35deg)}
.sigil::after{width:1px;height:22px;transform:rotate(35deg)}
.brand{font-family:"Palatino Linotype","Book Antiqua",Palatino,serif;font-size:24px;letter-spacing:.08em}
.eyebrow{margin:2px 0 0;color:var(--muted);font:600 9px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.15em}
.tabs{display:grid;grid-template-columns:repeat(4,minmax(88px,1fr));align-items:stretch}
.tab{
  min-height:54px;
  border:0;
  border-right:1px solid var(--line);
  background:transparent;
  padding:12px 10px;
  font-size:12px;
  transition:background .18s ease,color .18s ease;
}
.tab[aria-pressed="true"]{background:var(--ink);color:white}
.top-meta{display:flex;flex-direction:column;justify-content:center;align-items:flex-end;gap:5px;padding:12px 20px;text-align:right}
.demo-notice{color:#8b2d24;font:700 9px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.12em}
.study-id{font:600 13px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace}
.workspace{
  min-height:0;
  display:grid;
  grid-template-columns:218px minmax(440px,1fr) 292px;
  gap:0;
}
.rail{background:#e8eee8;border-right:1px solid var(--ink);padding:22px 17px;display:flex;flex-direction:column;gap:24px}
.section-label{margin:0 0 10px;color:var(--muted);font:700 9px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.16em}
.region-list{display:grid;gap:7px}
.region-button{
  min-height:44px;
  display:grid;
  grid-template-columns:18px 1fr auto;
  align-items:center;
  gap:8px;
  border:1px solid var(--line);
  background:transparent;
  padding:8px 10px;
  text-align:left;
  font-size:12px;
}
.region-button::before{content:"";width:9px;height:9px;border:1px solid currentColor;border-radius:50%}
.region-button::after{content:"↗";color:var(--muted)}
.region-button[aria-pressed="true"]{border-color:var(--ink);background:var(--sheet)}
.region-button[aria-pressed="true"]::before{background:var(--mint);border-color:var(--mint)}
.phase-track{position:relative;display:grid;gap:13px;margin-top:5px;padding-left:18px}
.phase-track::before{content:"";position:absolute;left:4px;top:6px;bottom:6px;width:1px;background:var(--line)}
.phase{position:relative;color:var(--muted);font:500 10px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace}
.phase::before{content:"";position:absolute;left:-17px;top:3px;width:7px;height:7px;background:var(--sheet);border:1px solid var(--muted);border-radius:50%}
.phase.active{color:var(--ink);font-weight:700}
.phase.active::before{background:var(--coral);border-color:var(--coral);box-shadow:0 0 0 4px rgb(240 111 95/.14)}
.rail-index{margin-top:auto;border-top:1px solid var(--line);padding-top:15px}
.rail-index strong{display:block;font:500 42px/.9 Georgia,"Times New Roman",serif}
.rail-index span{color:var(--muted);font:600 9px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.12em}
.board{min-width:0;position:relative;padding:24px 26px 18px;background:var(--sheet);overflow:hidden}
.board::before{content:"";position:absolute;inset:0;background-image:linear-gradient(rgb(17 35 31/.055) 1px,transparent 1px),linear-gradient(90deg,rgb(17 35 31/.055) 1px,transparent 1px);background-size:42px 42px;mask-image:linear-gradient(to bottom,#000,transparent 84%);pointer-events:none}
.board-head{position:relative;z-index:2;display:flex;align-items:flex-start;justify-content:space-between;gap:18px}
.board-title{margin:0;font:500 clamp(27px,3.2vw,46px)/.98 Georgia,"Times New Roman",serif;letter-spacing:-.045em}
.board-sub{margin:7px 0 0;color:var(--muted);font:600 10px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.1em}
.status{max-width:230px;min-height:42px;margin:0;padding:8px 10px;border-left:3px solid var(--mint);background:var(--mint-soft);font-size:11px;line-height:1.45}
.neural-stage{position:relative;z-index:1;min-height:380px;height:calc(100vh - 250px);display:grid;place-items:center;margin-top:2px}
.neural-map{width:min(100%,720px);height:100%;min-height:350px;overflow:visible}
.contour{fill:none;stroke:#aebdb5;stroke-width:1.2;vector-effect:non-scaling-stroke}
.fiber{fill:none;stroke:#91a59b;stroke-width:1;stroke-dasharray:4 7;vector-effect:non-scaling-stroke;transition:stroke .2s ease,opacity .2s ease}
.signal-path{fill:none;stroke:var(--violet);stroke-width:2.5;stroke-linecap:round;vector-effect:non-scaling-stroke;filter:drop-shadow(0 0 3px rgb(105 87 217/.28))}
.region-shape{fill:#e3ebe4;stroke:var(--ink);stroke-width:1.2;vector-effect:non-scaling-stroke;transition:fill .2s ease,opacity .2s ease,transform .2s ease;transform-box:fill-box;transform-origin:center}
.region-shape.active{fill:var(--acid);transform:scale(1.035)}
.node{fill:var(--sheet);stroke:var(--ink);stroke-width:1.3;vector-effect:non-scaling-stroke;transition:fill .2s ease,r .2s ease}
.node.active{fill:var(--coral);stroke:var(--coral);r:8px}
.node.pulse{animation:pulse 1.25s ease-in-out infinite}
@keyframes pulse{50%{opacity:.35}}
.axis{fill:var(--muted);font:600 9px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.08em}
.annotation-layer{position:absolute;inset:0;pointer-events:none}
.annotation-pin{position:absolute;width:18px;height:18px;display:grid;place-items:center;border-radius:50%;background:var(--coral);color:white;font:700 9px ui-monospace,SFMono-Regular,Menlo,monospace;box-shadow:0 0 0 5px rgb(240 111 95/.15)}
.timeline{position:relative;z-index:2;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:14px;border-top:1px solid var(--ink);padding-top:13px}
.timeline-label,.sample-value{font:700 9px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.13em}
.wave{width:100%;height:48px;background:#edf2ed;border-left:1px solid var(--line);border-right:1px solid var(--line)}
.wave path{fill:none;stroke:var(--ink);stroke-width:1.6;vector-effect:non-scaling-stroke}
.wave line{stroke:var(--coral);stroke-width:1;vector-effect:non-scaling-stroke}
.inspector{background:var(--ink);color:#f5faf6;padding:22px 18px;display:flex;min-width:0;flex-direction:column;gap:22px}
.inspector .section-label{color:#a9bbb3}
.metric-grid{display:grid;grid-template-columns:1fr 1fr;border-top:1px solid #41534c;border-left:1px solid #41534c}
.metric{min-height:86px;padding:11px;border-right:1px solid #41534c;border-bottom:1px solid #41534c}
.metric span{display:block;color:#a9bbb3;font:600 9px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.08em}
.metric strong{display:block;margin-top:9px;font:400 25px/1 Georgia,"Times New Roman",serif}
.activity-bars{height:112px;display:flex;align-items:end;gap:5px;padding:10px 0 4px;border-bottom:1px solid #41534c}
.activity-bar{flex:1;min-width:4px;background:var(--mint);transition:height .2s ease,background .2s ease}
.activity-bar:nth-child(3n){background:var(--acid)}
.action-stack{display:grid;gap:8px}
.action-button{min-height:44px;border:1px solid #65776f;background:transparent;color:white;padding:9px 12px;text-align:left;font-size:12px}
.action-button.primary{background:var(--acid);border-color:var(--acid);color:var(--ink);font-weight:700}
.action-button[aria-pressed="true"]{background:var(--coral);border-color:var(--coral)}
.study-log{min-height:56px;max-height:100px;overflow:auto;margin:0;padding:0;list-style:none;border-top:1px solid #41534c}
.study-log li{padding:7px 0;border-bottom:1px solid #41534c;color:#dbe7e1;font:500 9px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace}
@media(max-width:980px){
  .topbar{grid-template-columns:1fr auto}.identity{border-right:0}.tabs{grid-column:1/-1;grid-row:2;border-top:1px solid var(--ink)}.top-meta{grid-column:2;grid-row:1}
  .workspace{grid-template-columns:180px minmax(0,1fr)}.inspector{grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr 1fr;align-items:start}.neural-stage{height:430px}.study-log{max-height:130px}
}
@media(max-width:680px){
  .topbar{display:flex;flex-wrap:wrap}.identity{width:62%;padding:12px}.top-meta{width:38%;padding:10px}.tabs{width:100%;overflow-x:auto;grid-template-columns:repeat(4,minmax(116px,1fr))}
  .workspace{display:block}.rail{border-right:0;border-bottom:1px solid var(--ink);padding:16px}.region-list{grid-template-columns:repeat(3,1fr)}.phase-track,.rail-index{display:none}
  .board{padding:20px 14px 14px}.board-head{display:block}.status{margin-top:12px;max-width:none}.neural-stage{height:360px;min-height:330px}.timeline{grid-template-columns:1fr auto}.timeline-label{grid-column:1/-1}.wave{height:42px}
  .inspector{display:block;padding:20px 14px}.inspector section+section{margin-top:20px}.action-stack{grid-template-columns:1fr 1fr}.study-log{max-height:110px}
}
@media(max-width:430px){
  .brand{font-size:19px}.eyebrow{font-size:8px}.demo-notice{font-size:7px}.study-id{font-size:10px}.region-list{grid-template-columns:1fr}.region-button{min-height:42px}.board-title{font-size:30px}.neural-stage{height:320px;min-height:300px}.metric{min-height:76px}.metric strong{font-size:21px}
}
`,
    body: `
<div class="app">
  <header class="topbar">
    <div class="identity">
      <span class="sigil" aria-hidden="true"></span>
      <div><div class="brand">${escapeFlagshipMarkup(copy.brand)}</div><p class="eyebrow">${text("eyebrow")}</p></div>
    </div>
    <nav class="tabs" aria-label="${text("eyebrow")}">
      <button class="tab" type="button" data-action="panel" data-value="overview" aria-label="${text("overview")}">${text("overview")}</button>
      <button class="tab" type="button" data-action="panel" data-value="signals" aria-label="${text("signals")}">${text("signals")}</button>
      <button class="tab" type="button" data-action="panel" data-value="cohort" aria-label="${text("cohort")}">${text("cohort")}</button>
      <button class="tab" type="button" data-action="panel" data-value="compare" aria-label="${text("compare")}">${text("compare")}</button>
    </nav>
    <div class="top-meta"><span class="demo-notice">${text("demoNotice")}</span><span class="study-id">${text("study")}</span></div>
  </header>

  <main class="workspace">
    <aside class="rail">
      <section>
        <p class="section-label">${text("region")}</p>
        <div class="region-list">
          <button class="region-button" type="button" data-action="region" data-value="cortex" aria-label="${text("cortex")}">${text("cortex")}</button>
          <button class="region-button" type="button" data-action="region" data-value="stem" aria-label="${text("stem")}">${text("stem")}</button>
          <button class="region-button" type="button" data-action="region" data-value="network" aria-label="${text("network")}">${text("network")}</button>
        </div>
      </section>
      <section>
        <p class="section-label">${text("timeline")}</p>
        <div class="phase-track" aria-hidden="true">
          <span class="phase active" data-phase="baseline">${text("baseline")}</span>
          <span class="phase" data-phase="stimulus">${text("stimulus")}</span>
          <span class="phase" data-phase="recovery">${text("recovery")}</span>
        </div>
      </section>
      <div class="rail-index"><strong id="railSample">024</strong><span>${text("sample")}</span></div>
    </aside>

    <section class="board" aria-label="${text("activity")}">
      <div class="board-head">
        <div><h1 class="board-title" id="panelTitle">${text("overview")}</h1><p class="board-sub"><span id="regionName">${text("cortex")}</span> / ${text("study")}</p></div>
        <p class="status" id="notice" role="status" aria-live="polite">${text("stable")}</p>
      </div>
      <div class="neural-stage" id="neuralStage">
        <svg class="neural-map" viewBox="0 0 720 430" role="img" aria-label="${text("activity")}">
          <title>${text("activity")}</title>
          <path class="contour" d="M110 232C106 124 197 54 322 66c101-43 237 12 275 118 46 127-55 208-177 193-58 24-137 7-173-35-79 10-133-35-137-110Z"/>
          <path class="contour" d="M164 224c-3-74 62-119 142-108 72-31 174 8 201 81 29 82-39 135-126 126-42 19-94 5-119-24-56 8-94-24-98-75Z"/>
          <path class="fiber" d="M167 214C265 138 385 292 523 177"/>
          <path class="fiber" d="M179 281C289 311 367 112 540 255"/>
          <path class="fiber" d="M244 99C316 191 408 164 481 323"/>
          <path class="signal-path" id="signalPath" d="M150 246C236 125 351 312 565 196"/>
          <g data-map-region="cortex">
            <path class="region-shape active" d="M199 197c18-67 99-101 172-69 54-25 135 17 135 83 0 61-55 92-110 78-33 35-106 30-128-14-52 9-82-34-69-78Z"/>
            <circle class="node active" cx="263" cy="174" r="6"/><circle class="node" cx="355" cy="135" r="6"/><circle class="node" cx="446" cy="188" r="6"/>
          </g>
          <g data-map-region="stem">
            <path class="region-shape" d="M330 281c30-15 63-2 73 27l-4 74-26 32-30-31-7-67c-8-10-10-25-6-35Z"/>
            <circle class="node" cx="365" cy="320" r="6"/><circle class="node" cx="372" cy="371" r="6"/>
          </g>
          <g data-map-region="network">
            <circle class="node" cx="186" cy="254" r="6"/><circle class="node" cx="295" cy="244" r="6"/><circle class="node" cx="418" cy="263" r="6"/><circle class="node" cx="535" cy="217" r="6"/>
          </g>
          <text class="axis" x="38" y="28">N-204 / 01</text><text class="axis" x="590" y="406">SIM / 1:1</text>
        </svg>
        <div class="annotation-layer" id="annotationLayer" aria-hidden="true"></div>
      </div>
      <div class="timeline">
        <span class="timeline-label">${text("timeline")}</span>
        <svg class="wave" viewBox="0 0 600 48" preserveAspectRatio="none" aria-hidden="true"><path id="wavePath" d="M0 24L600 24"/><line id="sampleLine" x1="144" x2="144" y1="0" y2="48"/></svg>
        <span class="sample-value"><span>${text("sample")}</span> <strong id="sampleValue">024</strong></span>
      </div>
    </section>

    <aside class="inspector">
      <section>
        <p class="section-label">${text("biomarkers")}</p>
        <div class="metric-grid">
          <div class="metric"><span>${text("coherence")}</span><strong id="metricCoherence">0.84</strong></div>
          <div class="metric"><span>${text("response")}</span><strong id="metricResponse">72%</strong></div>
          <div class="metric"><span>${text("symmetry")}</span><strong id="metricSymmetry">0.91</strong></div>
          <div class="metric"><span>${text("sample")}</span><strong id="metricSample">024</strong></div>
        </div>
      </section>
      <section>
        <p class="section-label">${text("activity")}</p>
        <div class="activity-bars" id="activityBars" aria-label="${text("activity")}">
          <i class="activity-bar"></i><i class="activity-bar"></i><i class="activity-bar"></i><i class="activity-bar"></i><i class="activity-bar"></i><i class="activity-bar"></i><i class="activity-bar"></i><i class="activity-bar"></i><i class="activity-bar"></i><i class="activity-bar"></i><i class="activity-bar"></i><i class="activity-bar"></i>
        </div>
      </section>
      <section>
        <div class="action-stack">
          <button class="action-button primary" id="runButton" type="button" data-action="run" aria-label="${text("play")}">${text("play")}</button>
          <button class="action-button" type="button" data-action="snapshot" aria-label="${text("snapshot")}">${text("snapshot")}</button>
          <button class="action-button" type="button" data-action="annotate" aria-label="${text("annotate")}">${text("annotate")}</button>
        </div>
        <ul class="study-log" id="studyLog" aria-live="polite"></ul>
      </section>
    </aside>
  </main>
</div>
`,
    script: `
const U=${flagshipScriptData(ui)};
const state={panel:"overview",region:"cortex",running:false,sample:24,tick:0,snapshots:0,annotations:0,revision:0};
const controls=Array.from(document.querySelectorAll("[data-action]"));
const notice=document.getElementById("notice");
const panelTitle=document.getElementById("panelTitle");
const regionName=document.getElementById("regionName");
const railSample=document.getElementById("railSample");
const sampleValue=document.getElementById("sampleValue");
const metricSample=document.getElementById("metricSample");
const metricCoherence=document.getElementById("metricCoherence");
const metricResponse=document.getElementById("metricResponse");
const metricSymmetry=document.getElementById("metricSymmetry");
const signalPath=document.getElementById("signalPath");
const wavePath=document.getElementById("wavePath");
const sampleLine=document.getElementById("sampleLine");
const runButton=document.getElementById("runButton");
const annotationLayer=document.getElementById("annotationLayer");
const studyLog=document.getElementById("studyLog");
const bars=Array.from(document.querySelectorAll(".activity-bar"));
let timer=0;

function padded(value){return String(value).padStart(3,"0")}
function setNotice(value){state.revision+=1;notice.textContent=value;notice.dataset.revision=String(state.revision)}
function phase(){return state.sample<34?"baseline":state.sample<69?"stimulus":"recovery"}
function waveData(){
  const points=[];
  const regionBias=state.region==="cortex"?3:state.region==="stem"?8:13;
  const panelBias=state.panel==="signals"?7:state.panel==="compare"?4:0;
  for(let index=0;index<=60;index+=1){
    const x=index*10;
    const amplitude=5+((index+regionBias+state.tick)%9)+panelBias;
    const y=24+Math.sin((index+state.sample)*.48)*amplitude*.68+Math.cos(index*.21+regionBias)*4;
    points.push((index===0?"M":"L")+x.toFixed(1)+" "+y.toFixed(1));
  }
  return points.join("");
}
function signalData(){
  const offset=state.region==="cortex"?0:state.region==="stem"?24:-20;
  const lift=state.panel==="compare"?-18:state.panel==="cohort"?14:0;
  return "M150 "+(246+lift)+"C236 "+(125+offset)+" 351 "+(312-offset)+" 565 "+(196+lift);
}
function render(){
  document.body.dataset.panel=state.panel;
  document.body.dataset.region=state.region;
  document.body.dataset.phase=phase();
  controls.forEach((control)=>{
    const value=control.dataset.value;
    if(control.dataset.action==="panel")control.setAttribute("aria-pressed",String(value===state.panel));
    if(control.dataset.action==="region")control.setAttribute("aria-pressed",String(value===state.region));
  });
  panelTitle.textContent=U[state.panel];
  regionName.textContent=U[state.region];
  const sample=padded(state.sample);
  railSample.textContent=sample;sampleValue.textContent=sample;metricSample.textContent=sample;
  const regionIndex=state.region==="cortex"?0:state.region==="stem"?1:2;
  const panelIndex=state.panel==="overview"?0:state.panel==="signals"?1:state.panel==="cohort"?2:3;
  metricCoherence.textContent=(.84+regionIndex*.03-panelIndex*.01).toFixed(2);
  metricResponse.textContent=String(72+panelIndex*4-regionIndex*3)+"%";
  metricSymmetry.textContent=(.91-regionIndex*.04+panelIndex*.01).toFixed(2);
  wavePath.setAttribute("d",waveData());
  signalPath.setAttribute("d",signalData());
  const cursor=state.sample*6;
  sampleLine.setAttribute("x1",String(cursor));sampleLine.setAttribute("x2",String(cursor));
  document.querySelectorAll("[data-map-region]").forEach((group)=>{
    const active=group.getAttribute("data-map-region")===state.region;
    group.querySelectorAll(".region-shape,.node").forEach((shape)=>shape.classList.toggle("active",active));
    group.style.opacity=active?"1":".56";
  });
  document.querySelectorAll("[data-phase]").forEach((item)=>item.classList.toggle("active",item.getAttribute("data-phase")===phase()));
  bars.forEach((bar,index)=>{
    const height=24+((index*17+state.sample+regionIndex*13+panelIndex*7)%76);
    bar.style.height=String(height)+"%";
  });
  document.querySelectorAll(".node").forEach((node)=>node.classList.toggle("pulse",state.running));
  runButton.textContent=state.running?U.pause:U.play;
  runButton.setAttribute("aria-label",state.running?U.pause:U.play);
  runButton.setAttribute("aria-pressed",String(state.running));
}
function addLog(label,count){
  const item=document.createElement("li");
  item.textContent=label+" "+String(count).padStart(2,"0")+" · "+U.sample+" "+padded(state.sample);
  studyLog.prepend(item);
  while(studyLog.children.length>3)studyLog.lastElementChild.remove();
}
function syncTimer(){
  if(state.running&&timer===0){
    timer=window.setInterval(()=>{state.sample=(state.sample+3)%100;state.tick+=1;render()},700);
  }else if(!state.running&&timer!==0){window.clearInterval(timer);timer=0}
}
function handleControl(event){
  const control=event.currentTarget;
  const action=control.dataset.action;
  if(action==="panel"){
    state.panel=control.dataset.value;state.sample=(state.sample+7)%100;setNotice(U[state.panel]);
  }else if(action==="region"){
    state.region=control.dataset.value;state.sample=(state.sample+11)%100;setNotice(U[state.region]);
  }else if(action==="run"){
    state.running=!state.running;setNotice(state.running?U.stimulus:U.pause);syncTimer();
  }else if(action==="snapshot"){
    state.snapshots+=1;state.sample=(state.sample+5)%100;addLog(U.snapshot,state.snapshots);setNotice(U.noteSnapshot);
  }else if(action==="annotate"){
    state.annotations+=1;state.sample=(state.sample+4)%100;
    const pin=document.createElement("span");pin.className="annotation-pin";pin.textContent=String(state.annotations);pin.style.left=String(24+(state.annotations*19)%61)+"%";pin.style.top=String(30+(state.annotations*13)%43)+"%";annotationLayer.append(pin);
    addLog(U.annotate,state.annotations);setNotice(U.noteAnnotation);
  }
  state.tick+=1;render();
}
controls.forEach((control)=>control.addEventListener("click",handleControl));
render();
`,
  });
}
