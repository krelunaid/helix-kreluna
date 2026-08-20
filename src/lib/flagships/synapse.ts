import type { Locale } from "@/lib/i18n-core";
import { flagshipCopy } from "@/lib/flagships/copy";
import {
  escapeFlagshipMarkup,
  flagshipDocument,
  flagshipScriptData,
} from "@/lib/flagships/shared";

export function buildSynapseHtml(locale: Locale = "en"): string {
  const copy = flagshipCopy(locale, "synapse");
  const ui = copy.ui;
  const e = escapeFlagshipMarkup;

  const css = `
:root{color-scheme:light;--paper:#f2efe7;--sheet:#fbfaf5;--ink:#171714;--muted:#726f67;--line:#cbc6b8;--blue:#2646d9;--yellow:#efe36b;--task:#cfe5d5;--decision:#d9d4f2}
body{background:var(--paper);color:var(--ink);font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;overflow-x:hidden}
button,input{color:inherit}
button:focus-visible,input:focus-visible,canvas:focus-visible{outline:3px solid var(--blue);outline-offset:2px}
.synapse{min-height:100vh;display:grid;grid-template-rows:auto 1fr;border-top:5px solid var(--ink)}
.mast{min-height:78px;display:flex;align-items:center;gap:22px;padding:14px 22px;border-bottom:1px solid var(--line);background:var(--sheet)}
.brand{font-family:Georgia,"Times New Roman",serif;font-size:30px;letter-spacing:-.045em}
.eyebrow{font-size:10px;letter-spacing:.2em;color:var(--muted)}
.workspace-title{font-size:13px;font-weight:600}
.mast-search{margin-left:auto;min-width:min(320px,36vw)}
.mast-search input{width:100%;height:40px;border:0;border-bottom:1px solid var(--ink);background:transparent;padding:0 2px;border-radius:0}
.activity-toggle{height:40px;border:1px solid var(--ink);background:transparent;padding:0 14px;border-radius:0;font-weight:600}
.activity-toggle[aria-pressed="true"]{background:var(--ink);color:var(--sheet)}
.workbench{display:grid;grid-template-columns:210px minmax(0,1fr) 260px;min-height:0}
.documents{padding:24px 18px;border-right:1px solid var(--line);background:#e9e5da}
.section-label{margin:0 0 14px;font-size:10px;letter-spacing:.2em;color:var(--muted)}
.document-button{display:grid;width:100%;grid-template-columns:24px 1fr;gap:8px;align-items:start;border:0;border-top:1px solid var(--line);background:transparent;padding:13px 0;text-align:left;border-radius:0}
.document-button:last-child{border-bottom:1px solid var(--line)}
.document-button span:first-child{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:10px;color:var(--muted)}
.document-button[aria-pressed="true"]{color:var(--blue)}
.stage{min-width:0;display:grid;grid-template-rows:auto minmax(430px,1fr) auto;background:var(--sheet)}
.toolbar{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:12px 16px;border-bottom:1px solid var(--line)}
.toolbar button{min-height:36px;border:1px solid var(--line);background:transparent;padding:0 11px;border-radius:0;font-size:12px}
.toolbar button:hover,.toolbar button[aria-pressed="true"]{border-color:var(--ink);background:var(--ink);color:var(--sheet)}
.toolbar .primary{margin-right:8px;border-color:var(--blue);background:var(--blue);color:white}
.toolbar .filter{font-size:11px}
.canvas-wrap{position:relative;min-height:430px;overflow:hidden;background-image:linear-gradient(var(--line) 1px,transparent 1px),linear-gradient(90deg,var(--line) 1px,transparent 1px);background-size:32px 32px;background-position:-1px -1px}
.canvas-wrap::before{content:"";position:absolute;inset:0;background:linear-gradient(110deg,transparent 52%,rgb(38 70 217/.045));pointer-events:none}
#knowledge-canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:manipulation}
.canvas-caption{position:absolute;left:16px;top:14px;margin:0;padding:6px 8px;background:rgb(251 250 245/.88);font:10px ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.12em}
.selection-card{position:absolute;right:18px;bottom:18px;width:min(260px,calc(100% - 36px));border-left:5px solid var(--blue);background:var(--sheet);padding:14px 16px;box-shadow:8px 8px 0 rgb(23 23 20/.09)}
.selection-card small{display:block;margin-bottom:6px;font-size:9px;letter-spacing:.18em;color:var(--muted)}
.selection-card strong{font-family:Georgia,"Times New Roman",serif;font-size:20px;font-weight:400}
.stage-footer{display:flex;align-items:center;gap:14px;min-height:48px;padding:9px 16px;border-top:1px solid var(--line);font-size:11px}
.node-count{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;color:var(--muted)}
.stage-footer output{margin-left:auto;color:var(--blue);text-align:right}
.activity{padding:24px 18px;border-left:1px solid var(--line);background:var(--ink);color:var(--sheet)}
.activity ol{list-style:none;margin:0;padding:0}
.activity li{display:grid;grid-template-columns:34px 1fr;gap:10px;padding:14px 0;border-top:1px solid #44433e;font-size:12px;line-height:1.45}
.activity li:last-child{border-bottom:1px solid #44433e}
.activity time{font:10px ui-monospace,SFMono-Regular,Consolas,monospace;color:#aaa69c}
.activity .signal{margin-top:24px;padding:13px;background:var(--yellow);color:var(--ink);font-size:11px;line-height:1.45}
.synapse[data-activity="closed"] .workbench{grid-template-columns:210px minmax(0,1fr)}
.synapse[data-activity="closed"] .activity{display:none}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media(max-width:900px){
  .mast{align-items:flex-start;flex-wrap:wrap;gap:10px 16px}.mast-search{order:4;margin:0;min-width:100%}
  .workbench,.synapse[data-activity="closed"] .workbench{grid-template-columns:1fr}
  .documents{display:flex;gap:0;overflow:auto;padding:0 14px;border-right:0;border-bottom:1px solid var(--line)}
  .documents .section-label{align-self:center;min-width:max-content;margin:0 12px 0 0}
  .document-button{min-width:170px;border-top:0;border-right:1px solid var(--line);padding:13px 12px}
  .document-button:last-child{border-bottom:0}
  .activity{border-left:0;border-top:1px solid var(--line)}
  .stage{grid-template-rows:auto 520px auto}
}
@media(max-width:560px){
  .mast{padding:12px 14px}.brand{font-size:25px}.workspace-meta{flex:1}.activity-toggle{width:100%}
  .toolbar{padding:10px}.toolbar button{flex:1 1 auto;min-height:42px}
  .stage{grid-template-rows:auto 470px auto}.canvas-wrap{min-height:470px}
  .selection-card{right:12px;bottom:12px}.stage-footer{align-items:flex-start;flex-direction:column;gap:4px}.stage-footer output{margin-left:0;text-align:left}
}`;

  const body = `
<div class="synapse" id="synapse-root" data-activity="open" data-revision="0">
  <header class="mast">
    <div class="brand">${e(copy.brand)}</div>
    <div class="workspace-meta">
      <div class="eyebrow">${e(ui.eyebrow)}</div>
      <div class="workspace-title">${e(ui.workspace)}</div>
    </div>
    <label class="mast-search">
      <span class="sr-only">${e(ui.search)}</span>
      <input id="workspace-search" type="search" autocomplete="off" placeholder="${e(ui.search)}" aria-label="${e(ui.search)}">
    </label>
    <button class="activity-toggle" type="button" data-action="activity" aria-pressed="true" aria-label="${e(ui.activity)}">${e(ui.activity)}</button>
  </header>
  <main class="workbench">
    <nav class="documents" aria-label="${e(ui.documents)}">
      <p class="section-label">${e(ui.documents)}</p>
      <button class="document-button" type="button" data-action="doc-brief" data-document="brief" aria-pressed="true"><span>01</span><span>${e(ui.brief)}</span></button>
      <button class="document-button" type="button" data-action="doc-research" data-document="research" aria-pressed="false"><span>02</span><span>${e(ui.research)}</span></button>
      <button class="document-button" type="button" data-action="doc-direction" data-document="direction" aria-pressed="false"><span>03</span><span>${e(ui.direction)}</span></button>
    </nav>
    <section class="stage" aria-labelledby="canvas-title">
      <div class="toolbar" aria-label="${e(ui.canvas)}">
        <button class="primary" type="button" data-action="new-node">+ ${e(ui.addNode)}</button>
        <button type="button" data-action="focus" aria-pressed="false">${e(ui.focus)}</button>
        <button type="button" data-action="align" aria-pressed="false">${e(ui.align)}</button>
        <button type="button" data-action="connect" aria-pressed="false">${e(ui.connect)}</button>
        <button class="filter" type="button" data-action="filter-decision" data-filter="decision" aria-pressed="false">${e(ui.filterDecision)}</button>
        <button class="filter" type="button" data-action="filter-task" data-filter="task" aria-pressed="false">${e(ui.filterTask)}</button>
        <button class="filter" type="button" data-action="filter-all" data-filter="all" aria-pressed="true">${e(ui.filterAll)}</button>
      </div>
      <div class="canvas-wrap">
        <h1 class="canvas-caption" id="canvas-title">${e(ui.canvas)} / ${e(ui.workspace)}</h1>
        <canvas id="knowledge-canvas" tabindex="0" role="img" aria-label="${e(copy.capability)}"></canvas>
        <div class="selection-card" aria-live="polite">
          <small>${e(ui.owner)} · <span id="node-owner">A. CHEN</span> / ${e(ui.due)} · <span id="node-due">18.09</span></small>
          <strong id="node-selection">${e(ui.brief)}</strong>
        </div>
      </div>
      <footer class="stage-footer">
        <span class="node-count"><span id="node-count">4</span> ${e(ui.canvas)}</span>
        <span>${e(ui.decision)} / ${e(ui.task)} / ${e(ui.note)}</span>
        <output id="synapse-status" aria-live="polite">${e(copy.capability)}</output>
      </footer>
    </section>
    <aside class="activity" id="activity-panel" aria-label="${e(ui.activity)}">
      <p class="section-label">${e(ui.activity)}</p>
      <ol>
        <li><time>09:42</time><span>${e(ui.connected)}</span></li>
        <li><time>09:31</time><span>${e(ui.aligned)}</span></li>
        <li><time>09:08</time><span>${e(ui.newNode)}</span></li>
      </ol>
      <p class="signal">${e(copy.proof)}</p>
    </aside>
  </main>
</div>`;

  const script = `
const DATA=${flagshipScriptData({ locale, ui, capability: copy.capability })};
const root=document.getElementById("synapse-root");
const canvas=document.getElementById("knowledge-canvas");
const context=canvas.getContext("2d");
const statusOutput=document.getElementById("synapse-status");
const countOutput=document.getElementById("node-count");
const selectionOutput=document.getElementById("node-selection");
const ownerOutput=document.getElementById("node-owner");
const dueOutput=document.getElementById("node-due");
const activityPanel=document.getElementById("activity-panel");
const searchInput=document.getElementById("workspace-search");
const nodes=[
  {id:"brief",type:"note",label:DATA.ui.brief,owner:"A. CHEN",due:"18.09",x:.18,y:.22},
  {id:"research",type:"task",label:DATA.ui.research,owner:"M. ROSSI",due:"20.09",x:.58,y:.18},
  {id:"direction",type:"decision",label:DATA.ui.direction,owner:"L. PARK",due:"22.09",x:.34,y:.62},
  {id:"prototype",type:"task",label:DATA.ui.prototype,owner:"S. DIAZ",due:"24.09",x:.74,y:.66}
];
let selected="brief";
let filter="all";
let focused=false;
let aligned=false;
let connected=false;
let activityOpen=true;
let query="";
let revision=0;
let created=0;

function visibleNodes(){
  const term=query.trim().toLocaleLowerCase(DATA.locale);
  return nodes.filter(function(node){
    const typeMatch=filter==="all"||node.type===filter;
    const queryMatch=!term||node.label.toLocaleLowerCase(DATA.locale).includes(term);
    const focusMatch=!focused||node.id===selected;
    return typeMatch&&queryMatch&&focusMatch;
  });
}

function mark(message){
  revision+=1;
  root.dataset.revision=String(revision);
  statusOutput.textContent=message;
  countOutput.textContent=String(visibleNodes().length);
}

function updateSelection(){
  const node=nodes.find(function(item){return item.id===selected;})||nodes[0];
  selectionOutput.textContent=node.label;
  ownerOutput.textContent=node.owner;
  dueOutput.textContent=node.due;
  document.querySelectorAll("[data-document]").forEach(function(button){
    button.setAttribute("aria-pressed",String(button.dataset.document===selected));
  });
}

function updateButtons(){
  const focusButton=document.querySelector('[data-action="focus"]');
  const alignButton=document.querySelector('[data-action="align"]');
  const connectButton=document.querySelector('[data-action="connect"]');
  const activityButton=document.querySelector('[data-action="activity"]');
  focusButton.setAttribute("aria-pressed",String(focused));
  alignButton.setAttribute("aria-pressed",String(aligned));
  connectButton.setAttribute("aria-pressed",String(connected));
  activityButton.setAttribute("aria-pressed",String(activityOpen));
  document.querySelectorAll("[data-filter]").forEach(function(button){
    button.setAttribute("aria-pressed",String(button.dataset.filter===filter));
  });
}

function fitCanvas(){
  const rect=canvas.getBoundingClientRect();
  const ratio=Math.min(window.devicePixelRatio||1,2);
  const width=Math.max(1,Math.round(rect.width*ratio));
  const height=Math.max(1,Math.round(rect.height*ratio));
  if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
  if(context){context.setTransform(ratio,0,0,ratio,0,0);}
  draw();
}

function draw(){
  if(!context){return;}
  const width=canvas.clientWidth;
  const height=canvas.clientHeight;
  context.clearRect(0,0,width,height);
  const shown=visibleNodes();
  const positions=new Map();
  shown.forEach(function(node,index){
    const column=index%2;
    const row=Math.floor(index/2);
    const x=aligned ? .26+column*.44 : node.x;
    const y=aligned ? .28+row*.38 : node.y;
    positions.set(node.id,{x:x*width,y:y*height});
  });
  if(connected&&shown.length>1){
    context.strokeStyle="#2646d9";
    context.lineWidth=2;
    context.setLineDash([7,7]);
    context.beginPath();
    shown.forEach(function(node,index){
      const point=positions.get(node.id);
      if(index===0){context.moveTo(point.x,point.y);}else{context.lineTo(point.x,point.y);}
    });
    context.stroke();
    context.setLineDash([]);
  }
  shown.forEach(function(node){
    const point=positions.get(node.id);
    const active=node.id===selected;
    context.fillStyle=node.type==="decision"?"#d9d4f2":node.type==="task"?"#cfe5d5":"#efe36b";
    context.strokeStyle=active?"#2646d9":"#171714";
    context.lineWidth=active?4:1;
    context.fillRect(point.x-76,point.y-35,152,70);
    context.strokeRect(point.x-76,point.y-35,152,70);
    context.fillStyle="#171714";
    context.font="10px ui-monospace, monospace";
    const typeLabel=node.type==="decision"?DATA.ui.decision:node.type==="task"?DATA.ui.task:DATA.ui.note;
    context.fillText(typeLabel.toLocaleUpperCase(DATA.locale),point.x-64,point.y-13);
    context.font="600 13px Helvetica, Arial, sans-serif";
    const title=node.label.length>22?node.label.slice(0,21)+"…":node.label;
    context.fillText(title,point.x-64,point.y+12);
  });
}

function selectDocument(id){
  selected=id;
  focused=false;
  updateSelection();
  updateButtons();
  mark((nodes.find(function(node){return node.id===id;})||nodes[0]).label);
  draw();
}

function addNode(){
  created+=1;
  const node={id:"task-"+created,type:"task",label:DATA.ui.task+" "+String(4+created).padStart(2,"0"),owner:"A. CHEN",due:String(24+created)+".09",x:.2+((created*19)%60)/100,y:.24+((created*23)%55)/100};
  nodes.push(node);
  if(nodes.length>8){nodes.splice(4,1);}
  selected=node.id;
  filter="all";
  focused=false;
  updateSelection();
  updateButtons();
  mark(DATA.ui.newNode);
  draw();
}

document.querySelectorAll("[data-action]").forEach(function(button){
  button.addEventListener("click",function(){
    const action=button.dataset.action;
    if(action==="activity"){
      activityOpen=!activityOpen;
      root.dataset.activity=activityOpen?"open":"closed";
      activityPanel.hidden=!activityOpen;
      updateButtons();
      mark(activityOpen?DATA.ui.activityOn:DATA.ui.activityOff);
      window.requestAnimationFrame(fitCanvas);
    }else if(action==="doc-brief"){
      selectDocument("brief");
    }else if(action==="doc-research"){
      selectDocument("research");
    }else if(action==="doc-direction"){
      selectDocument("direction");
    }else if(action==="new-node"){
      addNode();
    }else if(action==="focus"){
      focused=!focused;
      updateButtons();
      mark(DATA.ui.focused);
      draw();
    }else if(action==="align"){
      aligned=!aligned;
      focused=false;
      root.dataset.aligned=String(aligned);
      updateButtons();
      mark(DATA.ui.aligned);
      draw();
    }else if(action==="connect"){
      connected=!connected;
      focused=false;
      root.dataset.connected=String(connected);
      updateButtons();
      mark(DATA.ui.connected);
      draw();
    }else if(action==="filter-decision"||action==="filter-task"||action==="filter-all"){
      filter=button.dataset.filter||"all";
      focused=false;
      updateButtons();
      mark(String(visibleNodes().length)+" "+DATA.ui.searchResult);
      draw();
    }
  });
});

searchInput.addEventListener("input",function(){
  query=searchInput.value;
  focused=false;
  mark(String(visibleNodes().length)+" "+DATA.ui.searchResult);
  draw();
});

canvas.addEventListener("click",function(event){
  const shown=visibleNodes();
  if(!shown.length){return;}
  const rect=canvas.getBoundingClientRect();
  const px=(event.clientX-rect.left)/Math.max(1,rect.width);
  const py=(event.clientY-rect.top)/Math.max(1,rect.height);
  let nearest=shown[0];
  let distance=Number.POSITIVE_INFINITY;
  shown.forEach(function(node,index){
    const x=aligned ? .26+(index%2)*.44 : node.x;
    const y=aligned ? .28+Math.floor(index/2)*.38 : node.y;
    const next=Math.hypot(px-x,py-y);
    if(next<distance){nearest=node;distance=next;}
  });
  selected=nearest.id;
  updateSelection();
  mark(nearest.label);
  draw();
});

canvas.addEventListener("keydown",function(event){
  if(event.key!=="Enter"&&event.key!==" "){return;}
  event.preventDefault();
  const shown=visibleNodes();
  if(!shown.length){return;}
  const current=Math.max(0,shown.findIndex(function(node){return node.id===selected;}));
  const next=shown[(current+1)%shown.length];
  selected=next.id;
  updateSelection();
  mark(next.label);
  draw();
});

window.addEventListener("resize",fitCanvas);
updateSelection();
updateButtons();
window.requestAnimationFrame(fitCanvas);`;

  return flagshipDocument({
    id: "synapse",
    locale,
    title: copy.title,
    themeColor: "#f2efe7",
    css,
    body,
    script,
  });
}
