import type { Locale } from "@/lib/i18n-core";
import { flagshipCopy } from "@/lib/flagships/copy";
import {
  escapeFlagshipMarkup,
  flagshipDocument,
  flagshipScriptData,
} from "@/lib/flagships/shared";

export function buildVantaHtml(locale: Locale = "en"): string {
  const copy = flagshipCopy(locale, "vanta");
  const ui = copy.ui;
  const e = escapeFlagshipMarkup;

  const css = `
:root{color-scheme:dark;--black:#070907;--panel:#0d100d;--line:#293029;--text:#d9e2d6;--muted:#7f8a7d;--lime:#b7ff48;--red:#ff5865;--amber:#f0b63a;--cyan:#58e1d5}
body{background:var(--black);color:var(--text);font-family:ui-monospace,"SFMono-Regular",Consolas,"Liberation Mono",monospace;font-size:12px;overflow-x:hidden}
button,input{border-radius:0;color:inherit}
button:focus-visible,input:focus-visible,canvas:focus-visible{outline:2px solid var(--lime);outline-offset:-2px}
.terminal{min-height:100vh;display:grid;grid-template-rows:auto 1fr 28px;background:var(--black)}
.topline{display:flex;align-items:center;gap:14px;min-height:48px;padding:6px 10px;border-bottom:1px solid var(--line);background:#090b09}
.mark{font-weight:800;letter-spacing:.16em;color:var(--lime);font-size:16px}
.eyebrow{color:var(--muted);font-size:10px;letter-spacing:.1em}
.desk{font-size:10px;color:var(--cyan)}
.simulation{margin-left:auto;border:1px solid var(--amber);padding:6px 8px;color:var(--amber);font-size:10px;letter-spacing:.08em}
.market-grid{display:grid;grid-template-columns:190px minmax(0,1fr) 248px;min-height:0}
.watch{border-right:1px solid var(--line);background:var(--panel)}
.panel-head{display:flex;justify-content:space-between;align-items:center;min-height:34px;padding:0 9px;border-bottom:1px solid var(--line);font-size:10px;letter-spacing:.12em;color:var(--muted)}
.symbol-row{display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center;width:100%;min-height:52px;padding:7px 9px;border:0;border-bottom:1px solid var(--line);background:transparent;text-align:left}
.symbol-row:hover,.symbol-row[aria-pressed="true"]{background:#151a14;color:var(--lime)}
.symbol-row strong{font-size:13px}.symbol-row small{display:block;color:var(--muted);font-weight:400;margin-top:2px}
.positive{color:var(--lime)}.negative{color:var(--red)}
.center{min-width:0;display:grid;grid-template-rows:auto minmax(300px,1fr) minmax(170px,.5fr);border-right:1px solid var(--line)}
.instrument{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-height:42px;padding:5px 8px;border-bottom:1px solid var(--line)}
.instrument .quote{display:flex;align-items:baseline;gap:8px;margin-right:auto}.instrument .quote strong{font-size:18px;color:var(--lime)}
.terminal-button{height:30px;padding:0 8px;border:1px solid var(--line);background:transparent;font-size:10px}
.terminal-button:hover,.terminal-button[aria-pressed="true"]{background:var(--text);border-color:var(--text);color:var(--black)}
.chart-panel{position:relative;min-height:300px;border-bottom:1px solid var(--line)}
#market-chart{position:absolute;inset:0;width:100%;height:100%}
.chart-label{position:absolute;left:9px;top:8px;z-index:1;margin:0;color:var(--muted);font-size:9px;letter-spacing:.12em}
.chart-readout{position:absolute;right:9px;top:8px;z-index:1;color:var(--lime);font-size:10px}
.blotter{min-height:0;overflow:auto}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
th,td{height:30px;padding:0 8px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap}
th:first-child,td:first-child{text-align:left}th{position:sticky;top:0;background:var(--panel);font-size:9px;letter-spacing:.1em;color:var(--muted);font-weight:500}
tr[data-pending="true"] td{color:var(--amber)}
.ticket{background:var(--panel);min-width:0}
.side-switch{display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid var(--line)}
.side-switch button{height:44px;border:0;border-right:1px solid var(--line);background:transparent;font-weight:800;letter-spacing:.12em}
.side-switch button:last-child{border-right:0}.side-switch button[data-side="buy"][aria-pressed="true"]{background:var(--lime);color:var(--black)}.side-switch button[data-side="sell"][aria-pressed="true"]{background:var(--red);color:var(--black)}
.order-form{display:grid;gap:12px;padding:14px 10px;border-bottom:1px solid var(--line)}
.order-form label{display:grid;gap:5px;color:var(--muted);font-size:10px;letter-spacing:.08em}
.order-form input{width:100%;height:36px;padding:0 8px;border:1px solid var(--line);background:var(--black);font-variant-numeric:tabular-nums}
.order-actions{display:grid;grid-template-columns:1fr;gap:6px}.order-actions button{height:38px;border:1px solid var(--line);background:transparent;font-weight:700}.order-actions .send{background:var(--text);color:var(--black)}
.risk{padding:12px 10px}.risk-grid{display:grid;grid-template-columns:1fr auto;gap:0}.risk-grid span,.risk-grid strong{padding:8px 0;border-bottom:1px solid var(--line)}.risk-grid span{color:var(--muted);font-size:10px}.risk-grid strong{text-align:right}
.risk button{width:100%;height:34px;margin-top:10px;border:1px solid var(--amber);background:transparent;color:var(--amber)}.risk button[aria-pressed="true"]{background:var(--amber);color:var(--black)}
.statusline{display:flex;align-items:center;gap:14px;padding:0 9px;border-top:1px solid var(--line);background:#090b09;color:var(--muted);font-size:10px;overflow:hidden}.statusline output{margin-left:auto;color:var(--cyan);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.statusline .truth{color:var(--amber)}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media(max-width:900px){
  .topline{align-items:flex-start;flex-wrap:wrap}.simulation{margin-left:0;width:100%}
  .market-grid{grid-template-columns:1fr}.watch{border-right:0;border-bottom:1px solid var(--line);overflow:auto}.watch-list{display:flex;min-width:610px}.symbol-row{min-width:200px;border-right:1px solid var(--line)}
  .center{border-right:0}.ticket{border-top:1px solid var(--line)}.ticket-layout{display:grid;grid-template-columns:minmax(250px,1fr) minmax(230px,.8fr)}.order-form{border-right:1px solid var(--line);border-bottom:0}
}
@media(max-width:560px){
  .topline{padding:8px}.desk{width:100%}.instrument{align-items:flex-start}.instrument .quote{width:100%}
  .instrument .terminal-button{flex:1}.chart-panel{min-height:280px}.center{grid-template-rows:auto 280px 190px}
  .ticket-layout{grid-template-columns:1fr}.order-form{border-right:0;border-bottom:1px solid var(--line)}
  .statusline{height:auto;min-height:42px;flex-wrap:wrap;padding:6px 9px}.statusline output{width:100%;margin-left:0}
}`;

  const body = `
<div class="terminal" id="vanta-root" data-revision="0" data-symbol="QNT" data-range="4H" data-view="line" data-side="neutral" data-risk="normal">
  <header class="topline">
    <div class="mark">${e(copy.brand)}</div>
    <div><div class="eyebrow">${e(ui.eyebrow)}</div><div class="desk">${e(ui.desk)}</div></div>
    <div class="simulation">${e(ui.simulated)}</div>
  </header>
  <main class="market-grid">
    <aside class="watch" aria-label="${e(ui.watchlist)}">
      <div class="panel-head"><span>${e(ui.watchlist)}</span><span>${e(ui.markets)}</span></div>
      <div class="watch-list">
        <button class="symbol-row" type="button" data-action="symbol-nxq" data-symbol="NXQ" aria-pressed="false" aria-label="${e(ui.symbol)} NXQ"><span><strong>NXQ</strong><small>Nexiq</small></span><span>184.62</span><span class="positive">+2.18%</span></button>
        <button class="symbol-row" type="button" data-action="symbol-astr" data-symbol="ASTR" aria-pressed="false" aria-label="${e(ui.symbol)} ASTR"><span><strong>ASTR</strong><small>Astra Systems</small></span><span>72.14</span><span class="negative">−0.84%</span></button>
        <button class="symbol-row" type="button" data-action="symbol-vlt" data-symbol="VLT" aria-pressed="false" aria-label="${e(ui.symbol)} VLT"><span><strong>VLT</strong><small>Volt Systems</small></span><span>39.88</span><span class="positive">+1.03%</span></button>
      </div>
    </aside>
    <section class="center" aria-labelledby="market-symbol">
      <div class="instrument">
        <div class="quote"><span id="market-symbol">QNT</span><strong id="market-price">106.30</strong><span class="positive" id="market-change">+0.42%</span></div>
        <button class="terminal-button" type="button" data-action="range-1d" data-range="1D" aria-pressed="false" aria-label="${e(ui.chart)} ${e(ui.range1d)}">${e(ui.range1d)}</button>
        <button class="terminal-button" type="button" data-action="range-1w" data-range="1W" aria-pressed="false" aria-label="${e(ui.chart)} ${e(ui.range1w)}">${e(ui.range1w)}</button>
        <button class="terminal-button" type="button" data-action="range-1m" data-range="1M" aria-pressed="false" aria-label="${e(ui.chart)} ${e(ui.range1m)}">${e(ui.range1m)}</button>
        <button class="terminal-button" type="button" data-action="view-candles" data-view="candles" aria-pressed="false" aria-label="${e(ui.candles)}">${e(ui.candles)}</button>
        <button class="terminal-button" type="button" data-action="view-depth" data-view="depth" aria-pressed="false" aria-label="${e(ui.depth)}">${e(ui.depth)}</button>
      </div>
      <div class="chart-panel">
        <p class="chart-label">${e(ui.chart)} / <span id="chart-mode">4H · QNT</span></p>
        <span class="chart-readout" id="chart-readout">106.30</span>
        <canvas id="market-chart" tabindex="0" role="img" aria-label="${e(ui.chart)}"></canvas>
      </div>
      <section class="blotter" aria-label="${e(ui.blotter)}">
        <div class="panel-head"><span>${e(ui.blotter)}</span><span>${e(ui.orders)}</span></div>
        <table>
          <thead><tr><th>${e(ui.symbol)}</th><th>${e(ui.buy)} / ${e(ui.sell)}</th><th>${e(ui.quantity)}</th><th>${e(ui.limit)}</th></tr></thead>
          <tbody id="blotter-body">
            <tr data-pending="true"><td>QNT</td><td>${e(ui.buy)}</td><td>120</td><td>106.10</td></tr>
            <tr><td>VLT</td><td>${e(ui.sell)}</td><td>80</td><td>39.72</td></tr>
          </tbody>
        </table>
      </section>
    </section>
    <aside class="ticket" aria-label="${e(ui.orders)}">
      <div class="panel-head"><span>${e(ui.orders)}</span><span>${e(ui.simulated)}</span></div>
      <div class="ticket-layout">
        <div>
          <div class="side-switch">
            <button type="button" data-action="side-buy" data-side="buy" aria-pressed="false" aria-label="${e(ui.buy)}">${e(ui.buy)}</button>
            <button type="button" data-action="side-sell" data-side="sell" aria-pressed="false" aria-label="${e(ui.sell)}">${e(ui.sell)}</button>
          </div>
          <form class="order-form" id="order-form">
            <label>${e(ui.quantity)}<input id="order-quantity" type="number" min="1" max="10000" value="100" required aria-label="${e(ui.quantity)}"></label>
            <label>${e(ui.limit)}<input id="order-limit" type="number" min="0.01" step="0.01" value="106.20" required aria-label="${e(ui.limit)}"></label>
            <div class="order-actions">
              <button class="send" type="button" data-action="simulate-order" aria-label="${e(ui.simulate)}">${e(ui.simulate)}</button>
              <button type="button" data-action="cancel-order" aria-label="${e(ui.cancel)}">${e(ui.cancel)}</button>
            </div>
          </form>
        </div>
        <section class="risk" aria-label="${e(ui.risk)}">
          <div class="panel-head"><span>${e(ui.risk)}</span><span>${e(ui.positions)}</span></div>
          <div class="risk-grid">
            <span>${e(ui.exposure)}</span><strong id="risk-exposure">€1.84M</strong>
            <span>${e(ui.var)}</span><strong id="risk-var">€82.4K</strong>
            <span>${e(ui.pnl)}</span><strong class="positive" id="risk-pnl">+€14.8K</strong>
          </div>
          <button type="button" data-action="stress-risk" aria-pressed="false" aria-label="${e(ui.risk)}">${e(ui.risk)} ±</button>
        </section>
      </div>
    </aside>
  </main>
  <footer class="statusline"><span class="truth">${e(ui.simulated)}</span><span id="terminal-state">QNT · 4H</span><output id="vanta-status" aria-live="polite">${e(ui.orderReady)}</output></footer>
</div>`;

  const script = `
const DATA=${flagshipScriptData({ locale, ui })};
const root=document.getElementById("vanta-root");
const canvas=document.getElementById("market-chart");
const context=canvas.getContext("2d");
const symbolOutput=document.getElementById("market-symbol");
const priceOutput=document.getElementById("market-price");
const changeOutput=document.getElementById("market-change");
const chartMode=document.getElementById("chart-mode");
const chartReadout=document.getElementById("chart-readout");
const terminalState=document.getElementById("terminal-state");
const statusOutput=document.getElementById("vanta-status");
const blotterBody=document.getElementById("blotter-body");
const quantityInput=document.getElementById("order-quantity");
const limitInput=document.getElementById("order-limit");
const orderForm=document.getElementById("order-form");
const exposureOutput=document.getElementById("risk-exposure");
const varOutput=document.getElementById("risk-var");
const pnlOutput=document.getElementById("risk-pnl");
const instruments={
  QNT:{price:106.30,change:"+0.42%",tone:"positive"},
  NXQ:{price:184.62,change:"+2.18%",tone:"positive"},
  ASTR:{price:72.14,change:"−0.84%",tone:"negative"},
  VLT:{price:39.88,change:"+1.03%",tone:"positive"}
};
let symbol="QNT";
let range="4H";
let view="line";
let side="neutral";
let stressed=false;
let revision=0;
let orderSequence=0;

function mark(message){
  revision+=1;
  root.dataset.revision=String(revision);
  root.dataset.symbol=symbol;
  root.dataset.range=range;
  root.dataset.view=view;
  root.dataset.side=side;
  root.dataset.risk=stressed?"stressed":"normal";
  const viewLabel=view==="depth"?DATA.ui.depth:view==="candles"?DATA.ui.candles:DATA.ui.chart;
  terminalState.textContent=symbol+" · "+range+" · "+viewLabel;
  statusOutput.textContent=message;
}

function updateButtons(){
  document.querySelectorAll("button[data-symbol]").forEach(function(button){button.setAttribute("aria-pressed",String(button.dataset.symbol===symbol));});
  document.querySelectorAll("button[data-range]").forEach(function(button){button.setAttribute("aria-pressed",String(button.dataset.range===range));});
  document.querySelectorAll("button[data-view]").forEach(function(button){button.setAttribute("aria-pressed",String(button.dataset.view===view));});
  document.querySelectorAll("button[data-side]").forEach(function(button){button.setAttribute("aria-pressed",String(button.dataset.side===side));});
  document.querySelector('[data-action="stress-risk"]').setAttribute("aria-pressed",String(stressed));
}

function updateQuote(){
  const current=instruments[symbol];
  symbolOutput.textContent=symbol;
  priceOutput.textContent=current.price.toFixed(2);
  changeOutput.textContent=current.change;
  changeOutput.className=current.tone;
  chartReadout.textContent=current.price.toFixed(2);
  chartMode.textContent=range+" · "+symbol+" · "+(view==="depth"?DATA.ui.depth:view==="candles"?DATA.ui.candles:DATA.ui.chart);
  limitInput.value=current.price.toFixed(2);
}

function seededValues(count){
  let seed=Array.from(symbol+range+view).reduce(function(total,character){return total+character.charCodeAt(0);},19);
  const values=[];
  let value=instruments[symbol].price*.94;
  for(let index=0;index<count;index+=1){
    seed=(seed*9301+49297)%233280;
    value+=((seed/233280)-.46)*instruments[symbol].price*.018;
    values.push(value);
  }
  return values;
}

function fitCanvas(){
  const rect=canvas.getBoundingClientRect();
  const ratio=Math.min(window.devicePixelRatio||1,2);
  const width=Math.max(1,Math.round(rect.width*ratio));
  const height=Math.max(1,Math.round(rect.height*ratio));
  if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
  if(context){context.setTransform(ratio,0,0,ratio,0,0);}
  drawChart();
}

function drawGrid(width,height){
  context.strokeStyle="#1d231d";
  context.lineWidth=1;
  for(let x=0;x<width;x+=64){context.beginPath();context.moveTo(x,0);context.lineTo(x,height);context.stroke();}
  for(let y=0;y<height;y+=42){context.beginPath();context.moveTo(0,y);context.lineTo(width,y);context.stroke();}
}

function drawChart(){
  if(!context){return;}
  const width=canvas.clientWidth;
  const height=canvas.clientHeight;
  context.clearRect(0,0,width,height);
  context.fillStyle="#070907";
  context.fillRect(0,0,width,height);
  drawGrid(width,height);
  const values=seededValues(42);
  const low=Math.min.apply(null,values)*.992;
  const high=Math.max.apply(null,values)*1.008;
  const yOf=function(value){return 24+(high-value)/(high-low)*Math.max(30,height-52);};
  if(view==="depth"){
    values.slice(0,18).forEach(function(value,index){
      const middle=height/2;
      const length=30+Math.abs(value-values[0])*15+(index%5)*14;
      context.fillStyle=index%2?"rgba(183,255,72,.55)":"rgba(255,88,101,.52)";
      context.fillRect(index%2?width/2:width/2-length,middle-115+index*13,length,8);
    });
  }else if(view==="candles"){
    const step=width/(values.length+2);
    values.forEach(function(value,index){
      const previous=index?values[index-1]:value*.998;
      const rising=value>=previous;
      const x=(index+1)*step;
      const y=yOf(value);
      const py=yOf(previous);
      context.strokeStyle=rising?"#b7ff48":"#ff5865";
      context.fillStyle=context.strokeStyle;
      context.beginPath();context.moveTo(x,Math.min(y,py)-7);context.lineTo(x,Math.max(y,py)+7);context.stroke();
      context.fillRect(x-3,Math.min(y,py),6,Math.max(2,Math.abs(y-py)));
    });
  }else{
    context.strokeStyle="#b7ff48";
    context.lineWidth=2;
    context.beginPath();
    values.forEach(function(value,index){const x=index/(values.length-1)*width;const y=yOf(value);if(index===0){context.moveTo(x,y);}else{context.lineTo(x,y);}});
    context.stroke();
  }
  const finalValue=values[values.length-1];
  chartReadout.textContent=finalValue.toFixed(2);
}

function setSymbol(next){
  symbol=next;
  updateQuote();
  updateButtons();
  mark(DATA.ui.symbol+" "+symbol);
  drawChart();
}

function setRange(next){
  range=next;
  updateQuote();
  updateButtons();
  mark(DATA.ui.chart+" · "+range);
  drawChart();
}

function setView(next){
  view=next;
  updateQuote();
  updateButtons();
  mark(next==="depth"?DATA.ui.depth:DATA.ui.candles);
  drawChart();
}

function setSide(next){
  side=next;
  updateButtons();
  mark(DATA.ui.orderReady+" · "+(side==="buy"?DATA.ui.buy:DATA.ui.sell));
}

function appendCell(row,text){
  const cell=document.createElement("td");
  cell.textContent=text;
  row.appendChild(cell);
}

function simulateOrder(){
  if(!orderForm.reportValidity()){return;}
  if(side==="neutral"){side="buy";}
  orderSequence+=1;
  const row=document.createElement("tr");
  row.dataset.pending="true";
  row.dataset.order=String(orderSequence);
  appendCell(row,symbol);
  appendCell(row,side==="buy"?DATA.ui.buy:DATA.ui.sell);
  appendCell(row,quantityInput.value);
  appendCell(row,Number(limitInput.value).toFixed(2));
  blotterBody.prepend(row);
  updateButtons();
  mark(DATA.ui.orderSent);
}

function cancelOrder(){
  const pending=blotterBody.querySelector('[data-pending="true"]');
  if(pending){pending.remove();}
  mark(DATA.ui.orderCancelled);
}

function toggleRisk(){
  stressed=!stressed;
  exposureOutput.textContent=stressed?"€2.36M":"€1.84M";
  varOutput.textContent=stressed?"€146.2K":"€82.4K";
  pnlOutput.textContent=stressed?"−€31.6K":"+€14.8K";
  pnlOutput.className=stressed?"negative":"positive";
  updateButtons();
  mark(DATA.ui.risk+" · "+(stressed?DATA.ui.simulated:DATA.ui.positions));
}

document.querySelectorAll("[data-action]").forEach(function(button){
  button.addEventListener("click",function(){
    const action=button.dataset.action;
    if(action.indexOf("symbol-")===0){setSymbol(button.dataset.symbol);}
    else if(action.indexOf("range-")===0){setRange(button.dataset.range);}
    else if(action==="view-candles"){setView("candles");}
    else if(action==="view-depth"){setView("depth");}
    else if(action==="side-buy"){setSide("buy");}
    else if(action==="side-sell"){setSide("sell");}
    else if(action==="simulate-order"){simulateOrder();}
    else if(action==="cancel-order"){cancelOrder();}
    else if(action==="stress-risk"){toggleRisk();}
  });
});

orderForm.addEventListener("submit",function(event){event.preventDefault();simulateOrder();});
quantityInput.addEventListener("input",function(){mark(DATA.ui.orderReady+" · "+quantityInput.value);});
limitInput.addEventListener("input",function(){mark(DATA.ui.orderReady+" · "+limitInput.value);});
window.addEventListener("resize",fitCanvas);
updateQuote();
updateButtons();
window.requestAnimationFrame(fitCanvas);`;

  return flagshipDocument({
    id: "vanta",
    locale,
    title: copy.title,
    themeColor: "#070907",
    css,
    body,
    script,
  });
}
