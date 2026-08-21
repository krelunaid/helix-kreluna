import type { Locale } from "@/lib/i18n-core";
import { flagshipCopy } from "@/lib/flagships/copy";
import {
  escapeFlagshipMarkup,
  flagshipDocument,
  flagshipScriptData,
} from "@/lib/flagships/shared";

export function buildMorphHtml(locale: Locale): string {
  const copy = flagshipCopy(locale, "morph");
  const ui = copy.ui;
  const text = (key: string) => escapeFlagshipMarkup(ui[key] ?? "");

  return flagshipDocument({
    id: "morph",
    locale,
    title: copy.title,
    themeColor: "#080907",
    css: `
:root{
  color-scheme:dark;
  --void:#080907;
  --carbon:#111310;
  --panel:#181b17;
  --line:#343a32;
  --fog:#9da59a;
  --paper:#f0f1e9;
  --signal:#ff5c35;
  --paint:#313633;
  --paint-edge:#7a837d;
  --cabin:#d7d0c1;
}
body{
  min-height:100vh;
  overflow-x:hidden;
  background:var(--void);
  color:var(--paper);
  font-family:Futura,"Century Gothic","Gill Sans",sans-serif;
  text-transform:uppercase;
  letter-spacing:.04em;
}
button,select{color:inherit;text-transform:uppercase;letter-spacing:.06em}
.shell{min-height:100vh;display:grid;grid-template-rows:auto minmax(520px,1fr) auto;background:var(--void)}
.mast{
  min-height:72px;
  display:grid;
  grid-template-columns:minmax(230px,.8fr) 1fr auto;
  align-items:center;
  gap:18px;
  padding:0 22px;
  border-bottom:1px solid var(--line);
  background:#0c0e0b;
}
.brand-lockup{display:flex;align-items:center;gap:13px;min-width:0}
.m-mark{width:38px;height:38px;position:relative;border:1px solid var(--fog);clip-path:polygon(0 0,100% 0,82% 100%,18% 100%)}
.m-mark::before,.m-mark::after{content:"";position:absolute;top:8px;bottom:8px;width:1px;background:var(--signal)}
.m-mark::before{left:13px;transform:skew(-12deg)}.m-mark::after{right:13px;transform:skew(12deg)}
.brand{font-size:20px;font-weight:800;letter-spacing:.2em}
.eyebrow{margin:4px 0 0;color:var(--fog);font:600 8px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.16em;white-space:nowrap}
.series{justify-self:center;font:700 11px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.18em;color:var(--fog)}
.mast-actions{display:flex;align-items:center;gap:8px}
.mast-button{
  min-height:42px;
  border:1px solid var(--line);
  background:transparent;
  padding:0 15px;
  font-size:10px;
  font-weight:700;
}
.mast-button[aria-pressed="true"]{border-color:var(--signal);color:var(--signal);box-shadow:inset 0 -2px var(--signal)}
.mast-button.save{background:var(--paper);border-color:var(--paper);color:var(--void)}
.stage{
  min-height:520px;
  position:relative;
  isolation:isolate;
  overflow:hidden;
  background:
    radial-gradient(circle at 58% 43%,rgb(255 255 255/.09),transparent 37%),
    linear-gradient(135deg,#151713 0 38%,#0a0b09 38.1% 100%);
  transition:background .35s ease;
}
.stage::before{content:"";position:absolute;z-index:-2;inset:0;background:linear-gradient(90deg,rgb(255 255 255/.035) 1px,transparent 1px),linear-gradient(rgb(255 255 255/.025) 1px,transparent 1px);background-size:84px 84px;transform:perspective(600px) rotateX(64deg) scale(1.55);transform-origin:bottom center;opacity:.7}
.stage::after{content:"";position:absolute;z-index:-1;left:-10%;right:-10%;bottom:18%;height:1px;background:linear-gradient(90deg,transparent,var(--fog),transparent);box-shadow:0 38px 70px rgb(0 0 0/.8)}
body[data-mode="road"] .stage{background:linear-gradient(128deg,#242723 0 27%,#0a0b09 27.2% 64%,#191b18 64.2%)}
body[data-mode="road"] .stage::before{background:linear-gradient(90deg,transparent 48%,rgb(240 241 233/.65) 48% 52%,transparent 52%);background-size:180px 100%;opacity:.28;transform:perspective(500px) rotateX(70deg) scale(1.75)}
body[data-mode="detail"] .stage{background:radial-gradient(circle at 67% 47%,rgb(255 92 53/.16),transparent 24%),#0a0b09}
.stage-head{position:absolute;z-index:4;top:22px;left:24px;right:24px;display:flex;align-items:flex-start;justify-content:space-between;gap:20px;pointer-events:none}
.stage-kicker{margin:0;color:var(--fog);font:600 9px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.17em}
.model-name{margin:5px 0 0;font-size:clamp(25px,3vw,45px);font-weight:800;letter-spacing:-.02em}
.view-readout{text-align:right}
.view-readout span{display:block;color:var(--fog);font:600 8px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.15em}
.view-readout strong{display:block;margin-top:5px;font-size:18px;letter-spacing:.12em}
.vehicle-wrap{position:absolute;inset:66px 180px 54px 90px;display:grid;place-items:center;transition:transform .4s cubic-bezier(.2,.7,.2,1)}
body[data-mode="detail"] .vehicle-wrap{transform:scale(1.34) translate(-4%,4%)}
.vehicle{width:min(100%,1040px);height:100%;max-height:620px;overflow:visible;filter:drop-shadow(0 44px 32px rgb(0 0 0/.72));transition:transform .45s cubic-bezier(.2,.7,.2,1)}
.vehicle-body{fill:var(--paint);stroke:var(--paint-edge);stroke-width:2;vector-effect:non-scaling-stroke;transition:fill .28s ease,stroke .28s ease}
.vehicle-edge{fill:none;stroke:rgb(255 255 255/.46);stroke-width:1.4;vector-effect:non-scaling-stroke}
.glass{fill:#171e1e;stroke:#69736e;stroke-width:1.2;vector-effect:non-scaling-stroke}
.cabin-glow{fill:var(--cabin);opacity:.24;transition:fill .25s ease}
.tire{fill:#050505;stroke:#4b4f49;stroke-width:2;vector-effect:non-scaling-stroke;transition:transform .25s ease;transform-box:fill-box;transform-origin:center}
.rim{fill:none;stroke:#c3c8c0;stroke-width:7;vector-effect:non-scaling-stroke;transition:stroke-width .25s ease}
body[data-wheel="wheelTrack"] .tire{transform:scale(1.08)}
body[data-wheel="wheelTrack"] .rim{stroke-width:11}
.lamp{fill:#bfc8bd;opacity:.42;transition:fill .2s ease,filter .2s ease,opacity .2s ease}
body[data-lights="on"] .lamp{fill:#fff7d0;opacity:1;filter:drop-shadow(0 0 14px #fff2a8)}
.tail-lamp{fill:#8f2419;opacity:.55}.tail-lamp.on{fill:var(--signal);opacity:1;filter:drop-shadow(0 0 13px var(--signal))}
.ground-shadow{fill:#000;opacity:.48}
.detail-line{stroke:var(--signal);stroke-width:1;stroke-dasharray:4 5;fill:none;vector-effect:non-scaling-stroke}
.detail-index{fill:var(--signal);font:700 11px ui-monospace,SFMono-Regular,Menlo,monospace}
.hotspot{position:absolute;z-index:5;left:58%;top:41%;width:33px;height:33px;display:grid;place-items:center;border:1px solid var(--signal);color:var(--signal);font:700 9px ui-monospace,SFMono-Regular,Menlo,monospace;transform:rotate(45deg);pointer-events:none}
.hotspot span{transform:rotate(-45deg)}
.spec-rail{
  position:absolute;
  z-index:6;
  right:0;
  top:0;
  bottom:0;
  width:178px;
  display:flex;
  flex-direction:column;
  background:rgb(8 9 7/.82);
  border-left:1px solid var(--line);
  backdrop-filter:blur(12px);
}
.spec-title{margin:0;padding:22px 16px 15px;border-bottom:1px solid var(--line);color:var(--fog);font:700 8px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.16em}
.spec-row{min-height:74px;padding:13px 16px;border-bottom:1px solid var(--line)}
.spec-row span{display:block;color:var(--fog);font:600 8px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.12em}
.spec-row strong{display:block;margin-top:9px;font-size:12px;line-height:1.35;letter-spacing:.08em}
.numbers{margin-top:auto;display:grid;grid-template-columns:1fr 1fr;border-top:1px solid var(--line)}
.number{min-height:88px;padding:12px;border-right:1px solid var(--line)}
.number:last-child{border-right:0}
.number span{display:block;color:var(--fog);font:600 7px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.1em}
.number strong{display:block;margin-top:8px;font-size:17px;letter-spacing:-.02em}
.notice{
  position:absolute;
  z-index:7;
  left:24px;
  bottom:20px;
  max-width:360px;
  min-height:38px;
  margin:0;
  padding:10px 12px 9px 17px;
  border-left:2px solid var(--signal);
  background:rgb(8 9 7/.78);
  color:#d8ddd5;
  font:500 9px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;
  letter-spacing:.06em;
  text-transform:none;
}
.saved-stamp{position:absolute;z-index:7;left:24px;bottom:72px;border:1px solid var(--signal);color:var(--signal);padding:6px 9px;font:700 8px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.15em}
.deck{
  min-height:142px;
  display:grid;
  grid-template-columns:1.05fr 1.5fr .9fr 1fr auto;
  border-top:1px solid var(--line);
  background:#0c0e0b;
}
.control-group{min-width:0;padding:14px 15px;border-right:1px solid var(--line)}
.control-label{display:block;margin:0 0 10px;color:var(--fog);font:700 8px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.16em}
.choice-row{display:flex;gap:6px;min-width:0}
.choice{
  min-height:42px;
  flex:1;
  min-width:0;
  border:1px solid var(--line);
  background:transparent;
  padding:6px 9px;
  color:#ced3cb;
  font-size:9px;
  font-weight:700;
}
.choice[aria-pressed="true"]{border-color:var(--paper);background:var(--paper);color:var(--void)}
.swatch{min-width:42px;position:relative;color:transparent}
.swatch::before{content:"";position:absolute;inset:7px;background:var(--swatch);clip-path:polygon(12% 0,100% 0,88% 100%,0 100%)}
.swatch[aria-pressed="true"]{background:transparent;color:transparent;box-shadow:inset 0 -3px var(--signal);border-color:var(--signal)}
.interior-select{width:100%;min-height:42px;border:1px solid var(--line);border-radius:0;background:var(--panel);padding:0 10px;color:var(--paper);font-size:9px;font-weight:700}
.deck-actions{display:grid;grid-template-columns:1fr;min-width:128px}
.deck-action{border:0;border-bottom:1px solid var(--line);background:transparent;padding:0 16px;color:var(--paper);font-size:9px;font-weight:800;text-align:left}
.deck-action:last-child{border-bottom:0;color:var(--fog)}
@media(max-width:980px){
  .shell{grid-template-rows:auto minmax(500px,1fr) auto}.mast{grid-template-columns:1fr auto}.series{display:none}.vehicle-wrap{inset:70px 160px 58px 30px}.deck{grid-template-columns:1fr 1.35fr 1fr}.control-group:nth-child(4){border-top:1px solid var(--line)}.deck-actions{grid-column:3;grid-row:1/3}.control-group{min-height:112px}
}
@media(max-width:700px){
  .mast{display:flex;flex-wrap:wrap;padding:10px 12px;gap:10px}.brand-lockup{flex:1}.mast-actions{width:100%;display:grid;grid-template-columns:1fr 1fr}.mast-button{min-height:44px}
  .shell{grid-template-rows:auto 570px auto}.stage-head{top:16px;left:14px;right:14px}.model-name{font-size:28px}.vehicle-wrap{inset:72px 0 170px 0}.vehicle{width:112%;max-width:none}.hotspot{left:64%;top:34%}
  .spec-rail{top:auto;left:0;right:0;bottom:0;width:auto;height:142px;display:grid;grid-template-columns:repeat(4,1fr)}.spec-title{grid-column:1/-1;padding:8px 12px}.spec-row{min-height:62px;padding:8px;border-right:1px solid var(--line)}.spec-row strong{font-size:9px;margin-top:6px}.numbers{display:none}
  .notice{left:14px;right:14px;bottom:154px;max-width:none}.saved-stamp{left:14px;bottom:205px}.deck{display:block}.control-group{border-right:0;border-bottom:1px solid var(--line);min-height:auto;padding:14px 12px}.deck-actions{display:grid;grid-template-columns:1fr 1fr;min-height:92px}.deck-action{min-height:46px;border-right:1px solid var(--line);border-bottom:0}
}
@media(max-width:430px){
  .brand{font-size:17px}.eyebrow{font-size:7px}.shell{grid-template-rows:auto 540px auto}.view-readout{display:none}.vehicle-wrap{inset:70px -48px 168px -48px}.stage::before{background-size:58px 58px}.choice-row{flex-wrap:wrap}.choice{min-width:calc(50% - 4px)}.swatch{min-width:42px}.spec-row strong{font-size:8px}.notice{font-size:8px}
}
`,
    body: `
<div class="shell">
  <header class="mast">
    <div class="brand-lockup">
      <span class="m-mark" aria-hidden="true"></span>
      <div><div class="brand">${escapeFlagshipMarkup(copy.brand)}</div><p class="eyebrow">${text("eyebrow")}</p></div>
    </div>
    <div class="series">${text("configurator")}</div>
    <div class="mast-actions">
      <button class="mast-button" type="button" data-action="lights" aria-label="${text("lights")}">${text("lights")}</button>
      <button class="mast-button save" type="button" data-action="save" aria-label="${text("save")}">${text("save")}</button>
    </div>
  </header>

  <main class="stage" aria-label="${text("configurator")}">
    <div class="stage-head">
      <div><p class="stage-kicker" id="modeLabel">${text("studio")}</p><h1 class="model-name">${text("spec")}</h1></div>
      <div class="view-readout"><span>${text("model")}</span><strong id="viewLabel">${text("viewSide")}</strong></div>
    </div>

    <div class="vehicle-wrap">
      <svg class="vehicle" viewBox="0 0 1000 600" role="img" aria-label="${text("configurator")}">
        <title>${text("configurator")}</title>
        <ellipse class="ground-shadow" cx="500" cy="500" rx="390" ry="38"/>
        <g data-vehicle-view="side">
          <path class="vehicle-body" d="M116 414c10-63 43-102 111-122l133-34 105-109h184l128 112 97 35c34 13 56 46 56 82v47H116Z"/>
          <path class="vehicle-edge" d="M154 382h178l51-100h282l89 100h149M361 258l105-109m183 0 128 112"/>
          <path class="glass" d="M389 260l90-92h152l104 92Z"/>
          <path class="cabin-glow" d="M475 179h154l86 72H405Z"/>
          <path class="lamp" d="M837 327l65 18 9 30-79-13Z"/>
          <path class="tail-lamp" d="M141 342l63-19-5 33-64 15Z"/>
          <circle class="tire" cx="292" cy="429" r="82"/><circle class="rim" cx="292" cy="429" r="48"/>
          <circle class="tire" cx="754" cy="429" r="82"/><circle class="rim" cx="754" cy="429" r="48"/>
          <path class="detail-line" d="M510 149V86h122"/><text class="detail-index" x="642" y="90">01 / M</text>
        </g>
        <g data-vehicle-view="front" hidden>
          <path class="vehicle-body" d="M260 421l36-180 116-96h176l116 96 36 180-54 50H314Z"/>
          <path class="glass" d="M374 245l67-75h118l67 75Z"/>
          <path class="cabin-glow" d="M405 231l48-48h94l48 48Z"/>
          <path class="vehicle-edge" d="M306 345h388M349 280l50-93m252 93-50-93"/>
          <path class="lamp" d="M307 311l116 19-29 47-97-16Z"/><path class="lamp" d="M693 311l-116 19 29 47 97-16Z"/>
          <rect class="tire" x="288" y="380" width="58" height="112"/><rect class="tire" x="654" y="380" width="58" height="112"/>
        </g>
        <g data-vehicle-view="rear" hidden>
          <path class="vehicle-body" d="M253 421l43-177 115-96h178l115 96 43 177-66 50H319Z"/>
          <path class="glass" d="M373 250l70-78h114l70 78Z"/>
          <path class="cabin-glow" d="M406 235l49-49h90l49 49Z"/>
          <path class="vehicle-edge" d="M303 344h394M348 287h304"/>
          <path class="tail-lamp" d="M294 308l140 15-34 43-108-12Z"/><path class="tail-lamp" d="M706 308l-140 15 34 43 108-12Z"/>
          <rect class="tire" x="286" y="382" width="59" height="110"/><rect class="tire" x="655" y="382" width="59" height="110"/>
        </g>
      </svg>
    </div>
    <div class="hotspot" aria-hidden="true"><span>01</span></div>

    <aside class="spec-rail" aria-label="${text("selection")}">
      <p class="spec-title">${text("selection")}</p>
      <div class="spec-row"><span>${text("body")}</span><strong id="bodySpec">${text("graphite")}</strong></div>
      <div class="spec-row"><span>${text("wheel")}</span><strong id="wheelSpec">${text("wheelAero")}</strong></div>
      <div class="spec-row"><span>${text("interior")}</span><strong id="interiorSpec">${text("interiorStone")}</strong></div>
      <div class="numbers">
        <div class="number"><span>${text("power")}</span><strong id="powerValue">410 kW</strong></div>
        <div class="number"><span>${text("range")}</span><strong id="rangeValue">612 km</strong></div>
      </div>
    </aside>
    <span class="saved-stamp" id="savedStamp" hidden>${text("saved")}</span>
    <p class="notice" id="notice" role="status" aria-live="polite">${escapeFlagshipMarkup(copy.capability)}</p>
  </main>

  <footer class="deck">
    <section class="control-group">
      <span class="control-label">${text("stance")}</span>
      <div class="choice-row">
        <button class="choice" type="button" data-action="mode" data-value="studio" aria-label="${text("studio")}">${text("studio")}</button>
        <button class="choice" type="button" data-action="mode" data-value="road" aria-label="${text("road")}">${text("road")}</button>
        <button class="choice" type="button" data-action="mode" data-value="detail" aria-label="${text("detail")}">${text("detail")}</button>
      </div>
    </section>
    <section class="control-group">
      <span class="control-label">${text("material")}</span>
      <div class="choice-row">
        <button class="choice swatch" style="--swatch:#313633" type="button" data-action="paint" data-value="graphite" aria-label="${text("graphite")}">${text("graphite")}</button>
        <button class="choice swatch" style="--swatch:#e8e5dc" type="button" data-action="paint" data-value="pearl" aria-label="${text("pearl")}">${text("pearl")}</button>
        <button class="choice swatch" style="--swatch:#a85836" type="button" data-action="paint" data-value="copper" aria-label="${text("copper")}">${text("copper")}</button>
        <button class="choice swatch" style="--swatch:#244c78" type="button" data-action="paint" data-value="cobalt" aria-label="${text("cobalt")}">${text("cobalt")}</button>
      </div>
    </section>
    <section class="control-group">
      <span class="control-label">${text("wheel")}</span>
      <div class="choice-row">
        <button class="choice" type="button" data-action="wheel" data-value="wheelAero" aria-label="${text("wheelAero")}">${text("wheelAero")}</button>
        <button class="choice" type="button" data-action="wheel" data-value="wheelTrack" aria-label="${text("wheelTrack")}">${text("wheelTrack")}</button>
      </div>
    </section>
    <section class="control-group">
      <label class="control-label" for="interiorSelect">${text("cabin")}</label>
      <select class="interior-select" id="interiorSelect" data-action="interior" aria-label="${text("cabin")}">
        <option value="interiorStone">${text("interiorStone")}</option>
        <option value="interiorInk">${text("interiorInk")}</option>
        <option value="interiorSaddle">${text("interiorSaddle")}</option>
      </select>
    </section>
    <div class="deck-actions">
      <button class="deck-action" type="button" data-action="rotate" aria-label="${text("rotate")}">${text("rotate")}</button>
      <button class="deck-action" type="button" data-action="reset" aria-label="${text("reset")}">${text("reset")}</button>
    </div>
  </footer>
</div>
`,
    script: `
const U=${flagshipScriptData(ui)};
const initial={mode:"studio",paint:"graphite",wheel:"wheelAero",interior:"interiorStone",lights:false,view:"side"};
const state={...initial,revision:0,saves:0};
const palette={graphite:["#313633","#7a837d"],pearl:["#e8e5dc","#ffffff"],copper:["#a85836","#e19a72"],cobalt:["#244c78","#5b8dbd"]};
const cabins={interiorStone:"#d7d0c1",interiorInk:"#303434",interiorSaddle:"#9d5a39"};
const controls=Array.from(document.querySelectorAll("[data-action]"));
const notice=document.getElementById("notice");
const modeLabel=document.getElementById("modeLabel");
const viewLabel=document.getElementById("viewLabel");
const bodySpec=document.getElementById("bodySpec");
const wheelSpec=document.getElementById("wheelSpec");
const interiorSpec=document.getElementById("interiorSpec");
const powerValue=document.getElementById("powerValue");
const rangeValue=document.getElementById("rangeValue");
const savedStamp=document.getElementById("savedStamp");
const interiorSelect=document.getElementById("interiorSelect");
const viewOrder=["front","side","rear"];

function setNotice(value){state.revision+=1;notice.textContent=value;notice.dataset.revision=String(state.revision)}
function viewCopy(){return state.view==="front"?U.viewFront:state.view==="rear"?U.viewRear:U.viewSide}
function render(){
  document.body.dataset.mode=state.mode;
  document.body.dataset.paint=state.paint;
  document.body.dataset.wheel=state.wheel;
  document.body.dataset.interior=state.interior;
  document.body.dataset.lights=state.lights?"on":"off";
  document.body.dataset.view=state.view;
  document.documentElement.style.setProperty("--paint",palette[state.paint][0]);
  document.documentElement.style.setProperty("--paint-edge",palette[state.paint][1]);
  document.documentElement.style.setProperty("--cabin",cabins[state.interior]);
  controls.forEach((control)=>{
    const action=control.dataset.action;
    const value=control.dataset.value;
    if(action==="mode")control.setAttribute("aria-pressed",String(value===state.mode));
    if(action==="paint")control.setAttribute("aria-pressed",String(value===state.paint));
    if(action==="wheel")control.setAttribute("aria-pressed",String(value===state.wheel));
    if(action==="lights")control.setAttribute("aria-pressed",String(state.lights));
  });
  modeLabel.textContent=U[state.mode];
  viewLabel.textContent=viewCopy();
  bodySpec.textContent=U[state.paint];
  wheelSpec.textContent=U[state.wheel];
  interiorSpec.textContent=U[state.interior];
  interiorSelect.value=state.interior;
  document.querySelectorAll("[data-vehicle-view]").forEach((group)=>{group.hidden=group.getAttribute("data-vehicle-view")!==state.view});
  document.querySelectorAll(".tail-lamp").forEach((lamp)=>lamp.classList.toggle("on",state.lights));
  const paintIndex=["graphite","pearl","copper","cobalt"].indexOf(state.paint);
  const trackBoost=state.wheel==="wheelTrack"?18:0;
  powerValue.textContent=String(410+trackBoost+paintIndex*3)+" kW";
  rangeValue.textContent=String(612-trackBoost-paintIndex*7)+" km";
}
function handleControl(event){
  const control=event.currentTarget;
  const action=control.dataset.action;
  if(action==="mode"){
    state.mode=control.dataset.value;setNotice(U[state.mode]);
  }else if(action==="paint"){
    state.paint=control.dataset.value;setNotice(U[state.paint]);
  }else if(action==="wheel"){
    state.wheel=control.dataset.value;setNotice(U[state.wheel]);
  }else if(action==="interior"){
    state.interior=control.value;setNotice(U[state.interior]);
  }else if(action==="lights"){
    state.lights=!state.lights;setNotice(U.lights+" · "+(state.lights?U.studio:U.detail));
  }else if(action==="rotate"){
    const next=(viewOrder.indexOf(state.view)+1)%viewOrder.length;state.view=viewOrder[next];setNotice(U.rotate+" · "+viewCopy());
  }else if(action==="save"){
    state.saves+=1;savedStamp.hidden=false;savedStamp.textContent=U.saved+" · "+String(state.saves).padStart(2,"0");setNotice(U.saved);
  }else if(action==="reset"){
    Object.assign(state,initial);savedStamp.hidden=true;setNotice(U.noticeReset);
  }
  render();
}
controls.forEach((control)=>control.addEventListener(control.tagName==="SELECT"?"change":"click",handleControl));
render();
`,
  });
}
