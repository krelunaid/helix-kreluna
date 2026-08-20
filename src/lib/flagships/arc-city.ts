import type { Locale } from "@/lib/i18n-core";
import { flagshipCopy } from "@/lib/flagships/copy";
import { escapeFlagshipMarkup, flagshipDocument, flagshipScriptData } from "@/lib/flagships/shared";

export function buildArcCityHtml(locale: Locale = "en"): string {
  const copy = flagshipCopy(locale, "arc-city");
  const ui = copy.ui;
  const text = escapeFlagshipMarkup;
  const districts = [
    { id: "harbor", name: ui.harbor, flow: 68, demand: 74, quality: 31, occupancy: 58 },
    { id: "central", name: ui.central, flow: 84, demand: 91, quality: 47, occupancy: 76 },
    { id: "north", name: ui.north, flow: 43, demand: 62, quality: 22, occupancy: 39 },
  ];

  return flagshipDocument({
    id: "arc-city",
    locale,
    title: copy.title,
    themeColor: "#f4f0e5",
    css: `
:root{color-scheme:light;--paper:#f4f0e5;--map:#ece8dc;--ink:#152a31;--quiet:#66777a;--rule:#b9c2bd;--traffic:#f05a3f;--energy:#ffd644;--air:#52bca6;--water:#4b9dc5;--transit:#6558cc}
body{min-height:100vh;background:var(--paper);color:var(--ink);font-family:"Trebuchet MS",Tahoma,sans-serif}
.city-shell{display:grid;grid-template-rows:auto minmax(560px,1fr) auto;min-height:100vh}
.civic-header{display:grid;grid-template-columns:auto 1fr auto;align-items:stretch;border-bottom:2px solid var(--ink);background:#faf8f1}.city-mark{display:grid;grid-template-columns:58px auto;align-items:center;border-right:1px solid var(--ink)}.arc-block{display:grid;height:58px;place-items:center;background:var(--traffic);color:#fff;font:800 17px/1 Georgia,serif;letter-spacing:.06em}.twin-name{padding:0 16px;font:700 13px/1.1 "Helvetica Neue",Arial,sans-serif;letter-spacing:.12em}.header-copy{align-self:center;padding:9px 18px}.header-copy p{margin:0;color:var(--quiet);font-size:10px;font-weight:700;letter-spacing:.18em}.header-copy h1{margin:4px 0 0;font:400 clamp(20px,2.6vw,34px)/1 Georgia,"Times New Roman",serif}.live-time{display:grid;grid-template-columns:auto auto;align-items:center;border-left:1px solid var(--ink)}.live-chip{align-self:stretch;display:grid;place-items:center;padding:0 17px;background:var(--ink);color:#fff;font-size:9px;font-weight:800;letter-spacing:.18em}.city-clock{min-width:92px;padding:0 15px;font:700 15px/1 ui-monospace,SFMono-Regular,Consolas,monospace;text-align:center}
.city-board{display:grid;grid-template-columns:190px minmax(420px,1fr) 250px;min-height:0}.control-column,.insight-column{background:#faf8f1}.control-column{border-right:1px solid var(--ink)}.insight-column{border-left:1px solid var(--ink)}
.section-heading{margin:0;padding:13px 14px;border-bottom:1px solid var(--rule);color:var(--quiet);font-size:9px;font-weight:800;letter-spacing:.19em}.layer-list,.district-list{display:grid}.layer-control,.district-control{position:relative;display:grid;grid-template-columns:11px 1fr auto;align-items:center;gap:9px;width:100%;min-height:47px;padding:8px 13px;border:0;border-bottom:1px solid var(--rule);background:transparent;color:var(--ink);text-align:left;font-size:12px;font-weight:650}.layer-control::before{content:"";width:9px;height:9px;border:1px solid currentColor;background:transparent}.layer-control::after{content:"OFF";color:var(--quiet);font:700 8px/1 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.09em}.layer-control.is-active::before{background:currentColor}.layer-control.is-active::after{content:"ON"}.layer-control[data-layer="traffic"]{color:var(--traffic)}.layer-control[data-layer="energy"]{color:#9a7700}.layer-control[data-layer="air"]{color:#167563}.layer-control[data-layer="water"]{color:#217399}.layer-control[data-layer="transit"]{color:var(--transit)}.layer-control span{color:var(--ink)}
.district-control{grid-template-columns:24px 1fr auto}.district-index{font:700 9px/1 ui-monospace,SFMono-Regular,Consolas,monospace;color:var(--quiet)}.district-control::after{content:"→";font-size:15px}.district-control.is-active{background:var(--ink);color:#fff}.district-control.is-active .district-index{color:var(--energy)}
.layer-control:hover,.district-control:hover,.map-button:hover,.scenario-button:hover,.clear-button:hover{background:#ebe7da}.district-control.is-active:hover{background:var(--ink)}.layer-control:focus-visible,.district-control:focus-visible,.map-button:focus-visible,.scenario-button:focus-visible,.clear-button:focus-visible,.timeline-slider:focus-visible{outline:3px solid var(--traffic);outline-offset:-3px}
.map-stage{position:relative;min-width:0;min-height:560px;overflow:hidden;background:var(--map)}.map-stage::before{content:"";position:absolute;z-index:2;inset:12px;border:1px solid rgb(21 42 49/.28);pointer-events:none}.map-stage::after{content:"04 / GRID";position:absolute;z-index:3;left:22px;bottom:20px;padding:4px 6px;background:var(--paper);color:var(--quiet);font:700 8px/1 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.13em}
.city-map{position:absolute;inset:0;width:100%;height:100%;background:#e9e6da}.street{fill:none;stroke:#fff;stroke-width:9}.street-minor{fill:none;stroke:#f8f6ef;stroke-width:4}.block{stroke:#9ca9a6;stroke-width:1.2}.district{transition:opacity .18s,stroke-width .18s}.district.is-selected{stroke:var(--ink);stroke-width:4}.district-label{fill:var(--ink);font:700 13px/1 Arial,sans-serif;letter-spacing:.08em}.micro-label{fill:#647579;font:700 8px/1 ui-monospace,monospace;letter-spacing:.08em}.traffic-route{fill:none;stroke:var(--traffic);stroke-width:7;stroke-linecap:square;stroke-dasharray:13 7;animation:route 1.9s linear infinite}.transit-route{fill:none;stroke:var(--transit);stroke-width:4;stroke-dasharray:3 6}.energy-node{fill:var(--energy);stroke:#9a7700;stroke-width:2}.air-node{fill:var(--air);stroke:#fff;stroke-width:3}.water-shape{fill:rgb(75 157 197/.58)}
.map-tools{position:absolute;z-index:4;right:22px;top:22px;display:grid;grid-template-columns:38px 38px}.map-button{height:38px;border:1px solid var(--ink);background:#faf8f1;color:var(--ink);font-size:18px}.map-button:nth-child(2){border-left:0}.map-button.wide{grid-column:1/-1;width:76px;border-top:0;font-size:9px;font-weight:800;letter-spacing:.09em}.map-scale{position:absolute;z-index:4;right:22px;bottom:21px;padding:5px 7px;background:#faf8f1;color:var(--ink);font:700 9px/1 ui-monospace,SFMono-Regular,Consolas,monospace}
.selection-banner{display:grid;grid-template-columns:1fr auto;align-items:end;gap:8px;padding:17px 15px;border-bottom:1px solid var(--ink)}.selection-banner p{margin:0;color:var(--quiet);font-size:9px;font-weight:800;letter-spacing:.15em}.selection-banner h2{margin:5px 0 0;font:400 25px/1 Georgia,serif}.inspect-button{border:0;border-bottom:2px solid var(--ink);background:transparent;color:var(--ink);padding:5px 0;font-size:9px;font-weight:800;letter-spacing:.11em}
.metric-list{margin:0}.metric{padding:15px;border-bottom:1px solid var(--rule)}.metric div{display:flex;align-items:baseline;justify-content:space-between;gap:9px}.metric dt{color:var(--quiet);font-size:9px;font-weight:800;letter-spacing:.12em}.metric dd{margin:0;font:700 18px/1 ui-monospace,SFMono-Regular,Consolas,monospace}.metric-track{height:3px;margin-top:9px;background:#d9ddd6}.metric-fill{display:block;height:100%;background:var(--ink);transition:width .2s}.metric:nth-child(1) .metric-fill{background:var(--energy)}.metric:nth-child(2) .metric-fill{background:var(--traffic)}.metric:nth-child(3) .metric-fill{background:var(--air)}.metric:nth-child(4) .metric-fill{background:var(--transit)}
.alerts{border-bottom:1px solid var(--ink)}.alert{display:grid;grid-template-columns:8px 1fr;gap:9px;padding:11px 14px;border-top:1px solid var(--rule);font-size:10px;line-height:1.35}.alert::before{content:"";width:7px;height:7px;margin-top:3px;background:var(--traffic)}.alert.resolved{color:var(--quiet);text-decoration:line-through}.alert.resolved::before{background:var(--air)}.alert-count{float:right;color:var(--traffic)}.clear-button{width:100%;min-height:36px;border:0;border-top:1px solid var(--rule);background:transparent;color:var(--ink);font-size:9px;font-weight:800;letter-spacing:.12em}.clear-button:disabled{color:#9da8a4;background:#eeebe2}
.scenario-button{width:calc(100% - 28px);min-height:42px;margin:14px;border:1px solid var(--ink);background:var(--energy);color:var(--ink);font-size:10px;font-weight:850;letter-spacing:.09em}.city-status{min-height:46px;margin:0;padding:0 14px 14px;color:var(--quiet);font-size:10px;line-height:1.45}.insight-column.is-inspecting{box-shadow:inset 5px 0 0 var(--traffic)}
.city-timeline{display:grid;grid-template-columns:190px 1fr 250px;min-height:86px;border-top:2px solid var(--ink);background:#faf8f1}.timeline-title{display:grid;align-content:center;padding:0 14px;border-right:1px solid var(--ink);font-size:9px;font-weight:800;letter-spacing:.18em}.timeline-main{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:15px;padding:0 22px}.daypart{font:700 9px/1 ui-monospace,SFMono-Regular,Consolas,monospace;color:var(--quiet)}.timeline-slider{width:100%;height:4px;accent-color:var(--traffic)}.timeline-actions{display:grid;grid-template-columns:1fr 1fr;border-left:1px solid var(--ink)}.timeline-actions button{border:0;background:transparent;color:var(--ink);font-size:9px;font-weight:800;letter-spacing:.1em}.timeline-actions button+button{border-left:1px solid var(--rule)}
body[data-time="evening"] .map-stage{background:#dfddd4}body[data-time="evening"] .city-map{filter:saturate(.88) contrast(1.05)}body[data-time="evening"] .energy-node{filter:drop-shadow(0 0 7px #ffd644)}body.is-paused .traffic-route{animation-play-state:paused}
@keyframes route{to{stroke-dashoffset:-40}}
@media(max-width:930px){.city-board{grid-template-columns:160px minmax(360px,1fr) 220px}.city-timeline{grid-template-columns:160px 1fr 220px}.header-copy h1{font-size:22px}}
@media(max-width:720px){.city-shell{grid-template-rows:auto auto auto}.civic-header{grid-template-columns:1fr auto}.city-mark{border-right:0}.header-copy{grid-column:1/-1;grid-row:2;border-top:1px solid var(--ink)}.live-time{grid-column:2;grid-row:1}.live-chip{display:none}.city-board{display:flex;flex-direction:column}.map-stage{order:1;min-height:58vh}.control-column{order:2;border-right:0;border-top:2px solid var(--ink)}.insight-column{order:3;border-left:0;border-top:2px solid var(--ink)}.layer-list{grid-template-columns:repeat(5,1fr)}.layer-control{display:flex;justify-content:center;min-height:54px;padding:7px 3px;text-align:center}.layer-control::before,.layer-control::after{display:none}.district-list{grid-template-columns:repeat(3,1fr)}.district-control{grid-template-columns:auto 1fr;padding:8px}.district-control::after{display:none}.metric-list{display:grid;grid-template-columns:repeat(2,1fr)}.alerts{display:grid;grid-template-columns:1fr 1fr}.alerts .section-heading,.alerts .clear-button{grid-column:1/-1}.city-timeline{grid-template-columns:1fr;min-height:118px}.timeline-title{padding:12px 14px;border-right:0;border-bottom:1px solid var(--rule)}.timeline-main{padding:13px 14px}.timeline-actions{min-height:40px;border-left:0;border-top:1px solid var(--rule)}}
@media(max-width:440px){.arc-block{width:50px;height:50px}.city-mark{grid-template-columns:50px auto}.twin-name{padding-inline:10px;font-size:11px}.city-clock{min-width:72px;padding-inline:8px;font-size:12px}.header-copy{padding-inline:12px}.map-stage{min-height:470px}.layer-list{grid-template-columns:repeat(3,1fr)}.layer-control{border-right:1px solid var(--rule)}.district-control{display:block}.district-index{display:block;margin-bottom:5px}.metric-list{grid-template-columns:1fr 1fr}.timeline-main{gap:8px;padding-inline:10px}.map-tools{right:14px;top:14px}.map-scale{right:14px}.alerts{grid-template-columns:1fr}}
`,
    body: `
<main class="city-shell" aria-label="${text(copy.title)}">
  <header class="civic-header">
    <div class="city-mark"><span class="arc-block">ARC</span><span class="twin-name">${text(ui.twin)}</span></div>
    <div class="header-copy"><p>${text(ui.eyebrow)}</p><h1>${text(copy.title)}</h1></div>
    <div class="live-time"><span class="live-chip">${text(ui.live)}</span><time class="city-clock" id="city-clock">12:00</time></div>
  </header>
  <section class="city-board">
    <aside class="control-column" aria-label="${text(ui.layers)}">
      <h2 class="section-heading">${text(ui.layers)}</h2>
      <div class="layer-list">
        <button type="button" class="layer-control is-active" data-action="toggle-layer" data-layer="traffic" aria-pressed="true" aria-label="${text(ui.traffic)}"><span>${text(ui.traffic)}</span></button>
        <button type="button" class="layer-control is-active" data-action="toggle-layer" data-layer="energy" aria-pressed="true" aria-label="${text(ui.energy)}"><span>${text(ui.energy)}</span></button>
        <button type="button" class="layer-control" data-action="toggle-layer" data-layer="air" aria-pressed="false" aria-label="${text(ui.air)}"><span>${text(ui.air)}</span></button>
        <button type="button" class="layer-control is-active" data-action="toggle-layer" data-layer="water" aria-pressed="true" aria-label="${text(ui.water)}"><span>${text(ui.water)}</span></button>
        <button type="button" class="layer-control is-active" data-action="toggle-layer" data-layer="transit" aria-pressed="true" aria-label="${text(ui.transit)}"><span>${text(ui.transit)}</span></button>
      </div>
      <h2 class="section-heading">${text(ui.districts)}</h2>
      <div class="district-list">
        ${districts
          .map(
            (district, index) =>
              `<button type="button" class="district-control${district.id === "central" ? " is-active" : ""}" data-action="select-district" data-district="${district.id}" aria-pressed="${district.id === "central" ? "true" : "false"}" aria-label="${text(`${ui.selected}: ${district.name}`)}"><span class="district-index">0${index + 1}</span><span>${text(district.name)}</span></button>`,
          )
          .join("")}
      </div>
    </aside>
    <section class="map-stage" aria-label="${text(copy.capability)}">
      <svg class="city-map" id="city-map" viewBox="0 0 960 620" role="img" aria-label="${text(copy.title)}">
        <title>${text(copy.title)}</title>
        <g id="city-camera">
          <g id="water-layer"><path class="water-shape" d="M0 478 C165 422 292 512 434 472 S745 418 960 462 L960 620 L0 620Z"/><path fill="none" stroke="#fff" stroke-width="2" opacity=".8" d="M0 491 C165 435 292 525 434 485 S745 431 960 475"/></g>
          <g aria-hidden="true">
            <path class="street" d="M18 129 C214 168 352 102 508 149 S774 207 944 143"/><path class="street" d="M112 18 C151 167 108 324 174 452 S279 559 318 616"/><path class="street" d="M452 9 C430 162 509 281 474 426 S391 553 414 620"/><path class="street" d="M736 6 C670 172 746 301 711 463 S668 559 685 620"/>
            <path class="street-minor" d="M8 264 H942 M31 368 C259 332 446 391 626 349 S828 327 949 362 M265 21 C302 193 251 354 288 474 M594 18 C559 189 625 326 586 492 M847 34 C808 173 846 296 817 438"/>
          </g>
          <g id="district-layer">
            <path class="block district" data-map-district="north" fill="#d7e2c3" d="M73 58 L289 62 L326 216 L137 235 L48 172Z"/><path class="block" fill="#e1dec9" d="M322 49 L520 64 L533 214 L348 221Z"/><path class="block" fill="#d9e2db" d="M557 65 L824 50 L890 197 L570 222Z"/>
            <path class="block" fill="#e6d9c9" d="M53 281 L252 247 L275 403 L82 429Z"/><path class="block district is-selected" data-map-district="central" fill="#f5d7b7" d="M306 246 L620 236 L648 407 L293 421Z"/><path class="block" fill="#d8dad4" d="M661 240 L901 229 L916 414 L659 410Z"/>
            <path class="block district" data-map-district="harbor" fill="#c9dce1" d="M62 453 L281 435 L356 583 L126 600Z"/><path class="block" fill="#e4d5c8" d="M382 445 L630 432 L647 594 L397 594Z"/><path class="block" fill="#d7dec7" d="M674 438 L903 447 L926 586 L684 599Z"/>
            <text class="district-label" x="105" y="112">${text(ui.north)}</text><text class="micro-label" x="105" y="129">N-03 / 42.7</text>
            <text class="district-label" x="408" y="324">${text(ui.central)}</text><text class="micro-label" x="408" y="341">C-01 / 18.4</text>
            <text class="district-label" x="136" y="529">${text(ui.harbor)}</text><text class="micro-label" x="136" y="546">H-07 / 04.9</text>
          </g>
          <g id="traffic-layer"><path class="traffic-route" d="M23 270 C219 224 347 307 502 270 S735 216 937 273"/><path class="traffic-route" d="M450 28 C432 170 507 276 478 413 S414 542 430 603"/></g>
          <g id="energy-layer"><circle class="energy-node" cx="188" cy="175" r="9"/><circle class="energy-node" cx="477" cy="304" r="13"/><circle class="energy-node" cx="754" cy="168" r="8"/><circle class="energy-node" cx="558" cy="508" r="10"/><circle class="energy-node" cx="805" cy="488" r="7"/></g>
          <g id="air-layer" hidden><circle class="air-node" cx="225" cy="112" r="8"/><circle class="air-node" cx="534" cy="190" r="8"/><circle class="air-node" cx="755" cy="333" r="8"/><circle class="air-node" cx="327" cy="508" r="8"/></g>
          <g id="transit-layer"><path class="transit-route" d="M91 72 L272 184 L468 292 L701 367 L872 530"/><path class="transit-route" d="M801 68 L661 181 L468 292 L256 383 L102 540"/><g fill="#fff" stroke="#6558cc" stroke-width="3"><circle cx="91" cy="72" r="7"/><circle cx="468" cy="292" r="9"/><circle cx="872" cy="530" r="7"/></g></g>
          <g id="selection-marker" transform="translate(477 304)"><circle r="27" fill="none" stroke="#152a31" stroke-width="2"/><path d="M-35 0 H35 M0 -35 V35" stroke="#152a31" stroke-width="1"/></g>
        </g>
      </svg>
      <div class="map-tools">
        <button type="button" class="map-button" data-action="zoom-in" aria-label="${text(ui.zoomIn)}">+</button>
        <button type="button" class="map-button" data-action="zoom-out" aria-label="${text(ui.zoomOut)}">−</button>
        <button type="button" class="map-button wide" data-action="recenter-map" aria-label="${text(ui.camera)}">04</button>
      </div>
      <output class="map-scale" id="map-scale">1 : 24 000</output>
    </section>
    <aside class="insight-column" id="insight-column" aria-labelledby="district-name">
      <div class="selection-banner"><div><p>${text(ui.selected)}</p><h2 id="district-name">${text(ui.central)}</h2></div><button type="button" class="inspect-button" data-action="inspect-district" aria-expanded="false" aria-label="${text(ui.inspect)}">${text(ui.inspect)}</button></div>
      <dl class="metric-list">
        <div class="metric"><div><dt>${text(ui.demand)}</dt><dd><span id="demand-value">91</span>%</dd></div><span class="metric-track"><span class="metric-fill" id="demand-fill" style="width:91%"></span></span></div>
        <div class="metric"><div><dt>${text(ui.flow)}</dt><dd><span id="flow-value">84</span>%</dd></div><span class="metric-track"><span class="metric-fill" id="flow-fill" style="width:84%"></span></span></div>
        <div class="metric"><div><dt>${text(ui.quality)}</dt><dd><span id="quality-value">47</span></dd></div><span class="metric-track"><span class="metric-fill" id="quality-fill" style="width:47%"></span></span></div>
        <div class="metric"><div><dt>${text(ui.occupancy)}</dt><dd><span id="occupancy-value">76</span>%</dd></div><span class="metric-track"><span class="metric-fill" id="occupancy-fill" style="width:76%"></span></span></div>
      </dl>
      <section class="alerts" aria-labelledby="alert-title">
        <h2 class="section-heading" id="alert-title">${text(ui.alerts)} <span class="alert-count" id="alert-count">3</span></h2>
        <div class="alert">C-14 · 18:20</div><div class="alert">T-08 · 18:34</div><div class="alert resolved" data-alert="resolved">A-03 · 17:52</div>
        <button type="button" class="clear-button" data-action="clear-alerts" aria-label="${text(ui.clear)}">${text(ui.clear)}</button>
      </section>
      <button type="button" class="scenario-button" data-action="simulate-evening" aria-label="${text(ui.simulate)}">${text(ui.simulate)}</button>
      <p class="city-status" id="city-status" aria-live="polite">${text(ui.now)} · ${text(ui.central)}</p>
    </aside>
  </section>
  <footer class="city-timeline">
    <div class="timeline-title">${text(ui.timeline)}</div>
    <div class="timeline-main"><span class="daypart">${text(ui.morning)}</span><input class="timeline-slider" id="city-slider" data-action="time-scrub" type="range" min="6" max="22" value="12" aria-label="${text(ui.timeline)}"><span class="daypart">${text(ui.evening)}</span></div>
    <div class="timeline-actions"><button type="button" data-action="pause-city" aria-pressed="false" aria-label="${text(ui.pause)}">${text(ui.pause)}</button><button type="button" data-action="set-live" aria-label="${text(ui.live)}">${text(ui.live)}</button></div>
  </footer>
</main>`,
    script: `
const model=${flagshipScriptData({ districts, ui })};
const state={district:"central",layers:{traffic:true,energy:true,air:false,water:true,transit:true},zoom:1,hour:12,running:true,inspecting:false};
const byId=(id)=>document.getElementById(id);
const district=()=>model.districts.find((item)=>item.id===state.district);
const markerPositions={harbor:[188,507],central:[477,304],north:[188,152]};
function setStatus(value){byId("city-status").textContent=value;}
function setMapView(){
  const width=960/state.zoom,height=620/state.zoom;
  const x=(960-width)/2,y=(620-height)/2;
  byId("city-map").setAttribute("viewBox",x+" "+y+" "+width+" "+height);
  byId("map-scale").textContent="1 : "+String(Math.round(24000/state.zoom)).replace(/(\\d)(?=(\\d{3})+$)/g,"$1 ");
}
function syncDistrict(){
  const selected=district();
  const evening=Math.max(0,state.hour-16);
  const demand=Math.min(99,selected.demand+evening*2);
  const flow=Math.min(99,selected.flow+evening);
  const quality=Math.min(99,selected.quality+Math.max(0,state.hour-18));
  const occupancy=Math.min(99,selected.occupancy+evening*2);
  byId("district-name").textContent=selected.name;
  [["demand",demand],["flow",flow],["quality",quality],["occupancy",occupancy]].forEach((entry)=>{byId(entry[0]+"-value").textContent=String(entry[1]);byId(entry[0]+"-fill").style.width=entry[1]+"%";});
  document.querySelectorAll('[data-action="select-district"]').forEach((button)=>{const active=button.getAttribute("data-district")===state.district;button.classList.toggle("is-active",active);button.setAttribute("aria-pressed",String(active));});
  document.querySelectorAll("[data-map-district]").forEach((shape)=>shape.classList.toggle("is-selected",shape.getAttribute("data-map-district")===state.district));
  const position=markerPositions[state.district];byId("selection-marker").setAttribute("transform","translate("+position[0]+" "+position[1]+")");
}
function syncTime(){
  const label=String(state.hour).padStart(2,"0")+":00";
  byId("city-clock").textContent=label;byId("city-slider").value=String(state.hour);
  document.body.setAttribute("data-time",state.hour>=18?"evening":"day");syncDistrict();
}
function handleControl(control){
  const action=control.getAttribute("data-action");
  if(action==="toggle-layer"){
    const layer=control.getAttribute("data-layer");state.layers[layer]=!state.layers[layer];control.classList.toggle("is-active",state.layers[layer]);control.setAttribute("aria-pressed",String(state.layers[layer]));byId(layer+"-layer").hidden=!state.layers[layer];setStatus(control.textContent+" · "+(state.layers[layer]?"100%":"0%"));
  }else if(action==="select-district"){
    state.district=control.getAttribute("data-district");syncDistrict();setStatus(model.ui.selected+" · "+district().name);
  }else if(action==="zoom-in"||action==="zoom-out"){
    state.zoom=Math.max(.72,Math.min(1.65,state.zoom+(action==="zoom-in"?.15:-.15)));setMapView();setStatus(control.getAttribute("aria-label")+" · "+Math.round(state.zoom*100)+"%");
  }else if(action==="recenter-map"){
    state.zoom=1;setMapView();byId("city-camera").setAttribute("transform","translate(0 0)");setStatus(model.ui.camera+" · 04");
  }else if(action==="inspect-district"){
    state.inspecting=!state.inspecting;control.setAttribute("aria-expanded",String(state.inspecting));byId("insight-column").classList.toggle("is-inspecting",state.inspecting);byId("insight-column").setAttribute("data-inspecting",String(state.inspecting));setStatus(model.ui.inspect+" · "+district().name);
  }else if(action==="simulate-evening"){
    state.hour=19;state.running=false;syncTime();document.body.classList.add("is-paused");const pause=document.querySelector('[data-action="pause-city"]');pause.textContent=model.ui.resume;pause.setAttribute("aria-label",model.ui.resume);pause.setAttribute("aria-pressed","true");setStatus(model.ui.eventEnergy);
  }else if(action==="pause-city"){
    state.running=!state.running;control.textContent=state.running?model.ui.pause:model.ui.resume;control.setAttribute("aria-label",control.textContent);control.setAttribute("aria-pressed",String(!state.running));document.body.classList.toggle("is-paused",!state.running);setStatus(control.textContent+" · "+byId("city-clock").textContent);
  }else if(action==="set-live"){
    state.hour=12;state.running=true;syncTime();document.body.classList.remove("is-paused");const pause=document.querySelector('[data-action="pause-city"]');pause.textContent=model.ui.pause;pause.setAttribute("aria-label",model.ui.pause);pause.setAttribute("aria-pressed","false");setStatus(model.ui.live+" · "+model.ui.now);
  }else if(action==="time-scrub"){
    state.hour=Number(control.value);syncTime();setStatus(model.ui.timeline+" · "+byId("city-clock").textContent);
  }else if(action==="clear-alerts"){
    document.querySelectorAll('[data-alert="resolved"]').forEach((alert)=>{alert.hidden=true;});byId("alert-count").textContent="2";control.disabled=true;control.setAttribute("aria-disabled","true");setStatus(model.ui.eventCleared);
  }
}
document.querySelectorAll("[data-action]").forEach((control)=>{control.addEventListener(control.matches('input[type="range"]')?"input":"click",()=>handleControl(control));});
let lastAdvance=0;
function advance(time){if(state.running&&time-lastAdvance>2600){state.hour=state.hour>=22?6:state.hour+1;syncTime();lastAdvance=time;}requestAnimationFrame(advance);}
setMapView();syncTime();requestAnimationFrame(advance);
`,
  });
}
