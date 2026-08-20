import { t, type Locale } from "@/lib/i18n-core";

function photo(id: string, w = 1400) {
  return `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;
}

function shell(title: string, css: string, body: string, script = "", locale: Locale = "en") {
  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title.replaceAll("<", "")}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;1,9..144,500&family=Outfit:wght@400;500;600&display=swap"/>
<style>
  *{box-sizing:border-box} html,body{margin:0;min-height:100%}
  body{font-family:Outfit,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
  img{max-width:100%;display:block;object-fit:cover}
  button{cursor:pointer;font-family:inherit}
  ${css}
</style>
</head>
<body>${body}${script ? `<script>${script}<\/script>` : ""}</body></html>`;
}

export function buildAureliaHtml(locale: Locale = "en") {
  const tx = (k: Parameters<typeof t>[1]) => t(locale, k);
  const hero = photo("photo-1613490493576-7fde63acd811");
  const room = photo("photo-1582719478250-c89cae4dc85b");
  const pool = photo("photo-1542314831-068cd1dbfeeb");
  const table = photo("photo-1414235077428-338989a2e8c0");
  return shell(
    tx("app.aur.title"),
    `
    body{background:#100c09;color:#f4ece3}
    header{position:absolute;z-index:2;inset:0 0 auto;display:flex;justify-content:space-between;padding:22px 24px;font-size:13px;letter-spacing:.18em;text-transform:uppercase}
    .hero{position:relative;min-height:88vh;display:grid;align-items:end}
    .hero img{position:absolute;inset:0;width:100%;height:100%}
    .hero::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 30%,#100c09)}
    .copy{position:relative;z-index:1;padding:36px 24px 48px;max-width:640px}
    h1{font-family:Fraunces,Georgia,serif;font-size:clamp(48px,10vw,88px);line-height:.95;margin:0 0 14px;font-weight:500}
    .lead{color:#d8cfc4;max-width:36ch;line-height:1.55}
    .cta{margin-top:22px;height:48px;padding:0 22px;border:0;border-radius:999px;background:#c4a574;color:#1a120c;font-weight:600}
    section{padding:40px 24px}
    h2{font-family:Fraunces,Georgia,serif;font-size:clamp(28px,5vw,42px);font-weight:500}
    .grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
    article{background:#1a1511;border-radius:22px;overflow:hidden}
    article img{height:180px;width:100%}
    article div{padding:14px 16px 18px;display:flex;justify-content:space-between;gap:8px}
    form{display:grid;gap:10px;max-width:420px}
    input,select{height:48px;border-radius:12px;border:1px solid #3a3028;background:#1a1511;color:inherit;padding:0 12px}
    .ok{color:#c4a574;min-height:1.2em}
  `,
    `
    <header><span>${tx("app.aur.title")}</span><span>Amalfi</span></header>
    <div class="hero">
      <img src="${hero}" alt=""/>
      <div class="copy">
        <h1>${tx("app.aur.h1")}</h1>
        <p class="lead">${tx("app.aur.lead")}</p>
        <button class="cta" onclick="document.getElementById('stay').scrollIntoView({behavior:'smooth'})">${tx("app.aur.cta")}</button>
      </div>
    </div>
    <section>
      <h2>${tx("app.aur.rooms")}</h2>
      <div class="grid">
        <article><img src="${room}" alt=""/><div><b>${tx("app.aur.r1")}</b><span>480€</span></div></article>
        <article><img src="${pool}" alt=""/><div><b>${tx("app.aur.r2")}</b><span>720€</span></div></article>
        <article><img src="${table}" alt=""/><div><b>${tx("app.aur.r3")}</b><span>90€</span></div></article>
      </div>
    </section>
    <section id="stay">
      <h2>${tx("app.aur.book")}</h2>
      <form onsubmit="event.preventDefault();document.getElementById('ok').textContent='${tx("app.aur.ok").replaceAll("'", "\\'")}';">
        <input required placeholder="${tx("app.aur.name")}"/>
        <select><option>${tx("app.aur.s1")}</option><option>${tx("app.aur.s2")}</option><option>${tx("app.aur.s3")}</option></select>
        <button class="cta" type="submit">${tx("app.aur.cta")}</button>
        <div class="ok" id="ok"></div>
      </form>
    </section>
  `,
    "",
    locale,
  );
}

export function buildMareaHtml(locale: Locale = "en") {
  const tx = (k: Parameters<typeof t>[1]) => t(locale, k);
  const sea = photo("photo-1567899378494-47b22a2ae96a");
  const deck = photo("photo-1544551763-46a013bb70d5");
  const night = photo("photo-1507525428034-b723cf961d3e");
  return shell(
    tx("app.mar.title"),
    `
    body{background:#061018;color:#e8f2f6}
    header{display:flex;justify-content:space-between;padding:20px 22px;letter-spacing:.2em;text-transform:uppercase;font-size:12px}
    .hero{position:relative;min-height:78vh}
    .hero img{position:absolute;inset:0;width:100%;height:100%}
    .hero::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgb(6 16 24/.2),#061018)}
    .copy{position:absolute;left:22px;bottom:32px;z-index:1;max-width:520px}
    h1{font-family:Fraunces,Georgia,serif;font-size:clamp(44px,9vw,80px);margin:0 0 10px;font-weight:500}
    .cta{margin-top:18px;height:46px;padding:0 20px;border:0;border-radius:999px;background:#7dd3fc;color:#04202c;font-weight:600}
    section{padding:32px 22px}
    .boats{display:grid;gap:12px}
    .boat{display:grid;grid-template-columns:120px 1fr auto;gap:12px;align-items:center;background:#0c1c28;border-radius:18px;overflow:hidden}
    .boat img{width:120px;height:110px}
    .boat b{font-family:Fraunces,Georgia,serif}
    .boat span{display:block;color:#9cb8c6;font-size:13px}
    .on{outline:2px solid #7dd3fc}
    .ok{color:#7dd3fc;min-height:1.2em;margin-top:12px}
  `,
    `
    <header><span>${tx("app.mar.title")}</span><span>Capri</span></header>
    <div class="hero">
      <img src="${sea}" alt=""/>
      <div class="copy">
        <h1>${tx("app.mar.h1")}</h1>
        <p>${tx("app.mar.lead")}</p>
        <button class="cta" onclick="document.getElementById('fleet').scrollIntoView({behavior:'smooth'})">${tx("app.mar.cta")}</button>
      </div>
    </div>
    <section id="fleet">
      <div class="boats">
        <article class="boat" onclick="pick(this,'Luna 42')"><img src="${deck}" alt=""/><div><b>Luna 42</b><span>${tx("app.mar.b1")}</span></div><b>1.200€</b></article>
        <article class="boat" onclick="pick(this,'Nero')"><img src="${night}" alt=""/><div><b>Nero</b><span>${tx("app.mar.b2")}</span></div><b>2.400€</b></article>
        <article class="boat" onclick="pick(this,'Vela')"><img src="${sea}" alt=""/><div><b>Vela</b><span>${tx("app.mar.b3")}</span></div><b>890€</b></article>
      </div>
      <p class="ok" id="ok"></p>
    </section>
  `,
    `function pick(el,name){document.querySelectorAll('.boat').forEach(b=>b.classList.remove('on'));el.classList.add('on');ok.textContent=${JSON.stringify(tx("app.mar.ok"))}+' '+name;}`,
    locale,
  );
}

export function buildVeloraHtml(locale: Locale = "en") {
  const tx = (k: Parameters<typeof t>[1]) => t(locale, k);
  const a = photo("photo-1515886657613-9f3515b0c78f");
  const b = photo("photo-1490481651871-ab68de25d43d");
  const c = photo("photo-1483985988355-763728e1935b");
  const d = photo("photo-1469334031218-e382a71b716b");
  return shell(
    tx("app.vel.title"),
    `
    body{background:#140e12;color:#f7eef2}
    header{display:flex;justify-content:space-between;align-items:center;padding:16px 18px}
    .mark{font-family:Fraunces,Georgia,serif;font-size:26px}
    .hero{padding:8px 18px 0}
    h1{font-family:Fraunces,Georgia,serif;font-size:clamp(36px,8vw,56px);margin:0 0 8px;font-weight:500}
    .feed{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:16px}
    .card{position:relative;border-radius:18px;overflow:hidden;min-height:220px}
    .card img{position:absolute;inset:0;width:100%;height:100%}
    .card span{position:absolute;left:10px;bottom:10px;background:#140e12cc;padding:6px 10px;border-radius:999px;font-size:12px}
    .bar{position:sticky;bottom:0;display:flex;justify-content:space-around;padding:10px;background:#1c1418;font-size:12px}
    .bar b{color:#f0a3c2}
    .sheet{display:none;position:fixed;inset:auto 12px 70px;background:#1c1418;border-radius:18px;padding:16px}
    .sheet.on{display:block}
    .cta{height:42px;border:0;border-radius:999px;background:#f0a3c2;color:#2a1018;font-weight:600;padding:0 16px}
  `,
    `
    <header><span class="mark">${tx("app.vel.title")}</span><span>${tx("app.vel.bag")}</span></header>
    <div class="hero"><h1>${tx("app.vel.h1")}</h1><p>${tx("app.vel.lead")}</p></div>
    <div class="feed">
      <button class="card" onclick="openLook('Noir silk')"><img src="${a}" alt=""/><span>Noir silk</span></button>
      <button class="card" onclick="openLook('Day linen')"><img src="${b}" alt=""/><span>Day linen</span></button>
      <button class="card" onclick="openLook('City coat')"><img src="${c}" alt=""/><span>City coat</span></button>
      <button class="card" onclick="openLook('Rose set')"><img src="${d}" alt=""/><span>Rose set</span></button>
    </div>
    <div class="sheet" id="sheet"><p id="look"></p><button class="cta" onclick="hold()">${tx("app.vel.hold")}</button></div>
    <nav class="bar"><span>${tx("app.vel.tab1")}</span><b>${tx("app.vel.tab2")}</b><span>${tx("app.vel.tab3")}</span></nav>
  `,
    `function openLook(n){sheet.classList.add('on');look.textContent=n;} function hold(){look.textContent=${JSON.stringify(tx("app.vel.ok"))};}`,
    locale,
  );
}

export function buildHaloHtml(locale: Locale = "en") {
  const tx = (k: Parameters<typeof t>[1]) => t(locale, k);
  const sky = photo("photo-1506126613408-eca07ce68773");
  return shell(
    tx("app.halo.title"),
    `
    body{background:#0b1020;color:#eef2ff}
    .hero{position:relative;min-height:46vh}
    .hero img{position:absolute;inset:0;width:100%;height:100%;filter:saturate(.8)}
    .hero::after{content:"";position:absolute;inset:0;background:linear-gradient(#0b102000,#0b1020)}
    .pad{padding:20px}
    h1{font-family:Fraunces,Georgia,serif;font-size:40px;margin:0}
    .mins{display:flex;gap:8px;margin:16px 0;flex-wrap:wrap}
    .mins button{height:40px;padding:0 14px;border-radius:999px;border:1px solid #2a3558;background:#141a30;color:inherit}
    .mins button.on{background:#7c3aed;border-color:transparent}
    .orb{width:180px;height:180px;margin:20px auto;border-radius:50%;background:radial-gradient(circle at 40% 35%,#c4b5fd,#6d28d9 55%,#0b1020);box-shadow:0 0 40px #7c3aed66}
    .cta{display:block;margin:0 auto;height:48px;padding:0 28px;border:0;border-radius:999px;background:#7c3aed;color:#fff;font-weight:600}
    .note{text-align:center;color:#a5b4d4;margin-top:12px}
  `,
    `
    <div class="hero"><img src="${sky}" alt=""/></div>
    <div class="pad">
      <h1>${tx("app.halo.h1")}</h1>
      <p>${tx("app.halo.lead")}</p>
      <div class="mins">
        <button class="on" data-m="10">10</button>
        <button data-m="20">20</button>
        <button data-m="30">30</button>
      </div>
      <div class="orb"></div>
      <button class="cta" id="go">${tx("app.halo.start")}</button>
      <p class="note" id="note"></p>
    </div>
  `,
    `
    let m=10;
    document.querySelectorAll('.mins button').forEach(b=>b.onclick=()=>{
      document.querySelectorAll('.mins button').forEach(x=>x.classList.remove('on'));
      b.classList.add('on'); m=+b.dataset.m;
    });
    go.onclick=()=>{note.textContent=${JSON.stringify(tx("app.halo.ok"))}.replace('{n}',m);};
  `,
    locale,
  );
}

