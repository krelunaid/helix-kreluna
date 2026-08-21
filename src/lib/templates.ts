import { t, type Locale } from "@/lib/i18n-core";
import { buildAureliaHtml, buildHaloHtml, buildMareaHtml, buildVeloraHtml } from "@/lib/showcase";
import { buildActstageHtml, buildMixlabHtml, buildSonarHtml } from "@/lib/webapps";
import {
	buildFlagshipHtml,
	flagshipFor,
	isFlagshipId,
} from "@/lib/flagships";

function matchTemplate(prompt: string) {
	const p = prompt.toLowerCase();
	if (/orbit command|orbital mission|satellite fleet|mission control/.test(p)) return "orbit-command";
	if (/neura\b|neural systems|neural twin|biotech visualization/.test(p)) return "neura";
	if (/synapse\b|collaborative intelligence|knowledge canvas/.test(p)) return "synapse";
	if (/vanta\b|market risk terminal|trading workstation/.test(p)) return "vanta";
	if (/arc city|urban systems twin|smart.city twin/.test(p)) return "arc-city";
	if (/morph\b|material configurator|automotive configurator/.test(p)) return "morph";
	if (/sonar|tornado|radar|meteo|storm/.test(p)) return "sonar";
	if (/remix|mixlab|musica|dj mix/.test(p)) return "mixlab";
	if (/actstage|teatro|live show|backstage/.test(p)) return "actstage";
	if (/aurelia|amalfi|villa|resort|hotel di lusso/.test(p)) return "aurelia";
	if (/marea|yacht|barca a vela|charter|capri/.test(p)) return "marea";
	if (/velora|lookbook app|skincare|capsule wardrobe/.test(p)) return "velora";
	if (/halo|meditaz|wellness|sonno|yoga app/.test(p)) return "halo";
	if (/gestional|fattur|erp|software|programma|magazzino|pos\b|ufficio|clienti e fattur/.test(p)) return "software";
	if (/moda|fashion|lookbook|maison|couture|abiti|vestit|boutique/.test(p)) return "maison";
	if (/vino|wine|cantina|degust|cellar|enoteca/.test(p)) return "cantina";
	if (/gioco|game|memory|puzzle|carta|carte|juego|jeu|spiel|jogo|mémoire|memoria/.test(p)) return "memory";
	if (/todo|lista|list|task|abitudin|scadenze|tareas|tâches|aufgaben|hábitos|habits/.test(p)) return "todo";
	if (/dashboard|kpi|analytics|report\b/.test(p)) return "dashboard";
	if (/caff|ristor|bar|menu|food|trattoria|bistrot|café|cafe|cafeteria/.test(p)) return "cafe";
	if (/portfolio|fotog|studio creativ|agenzia|architecture|arquitect|forma/.test(p)) return "portfolio";
	return "generic";
}
function publicOrigin() {
	return "";
}
function asset(name: string) {
	const origin = publicOrigin();
	return origin ? `${origin}/templates/${name}` : `/templates/${name}`;
}
function shell(title: string, css: string, body: string, script = "", locale: Locale = "en") {
	const origin = publicOrigin();
	return `<!DOCTYPE html>
<html lang="${locale}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
${origin ? `<base href="${origin}/"/>` : ""}
<title>${escapeHtml(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;1,9..144,500&family=Outfit:wght@400;500;600&display=swap"/>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body { margin: 0; min-height: 100%; }
  body { font-family: Outfit, "Segoe UI", sans-serif; -webkit-font-smoothing: antialiased; }
  img { max-width: 100%; display: block; object-fit: cover; }
  button, [role="button"] { cursor: pointer; font-family: inherit; }
  ${css}
</style>
</head>
<body>
${body}
${script ? `<script>${script}</script>` : ""}
</body>
</html>`;
}
function escapeHtml(s: string) {
	return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;");
}
function buildCafeHtml(locale: Locale = "en") {
	const tx = (k: Parameters<typeof t>[1], vars?: Record<string, string | number>) => t(locale, k, vars);
	const hero = asset("cafe-hero.jpg");
	const latte = asset("cafe-latte.jpg");
	const bread = asset("cafe-bread.jpg");
	const cake = asset("cafe-cake.jpg");
	const seat = asset("cafe-seat.jpg");
	return shell(tx("app.cafe.title"), `
    body { background: #1a120c; color: #f6efe6; }
    header { position: absolute; z-index: 2; inset: 0 0 auto; display: flex; justify-content: space-between; align-items: center; padding: 20px 22px; }
    .mark { font-family: Fraunces, Georgia, serif; font-size: 22px; }
    nav { display: flex; gap: 16px; font-size: 13px; color: #f6efe6; }
    .hero { position: relative; min-height: 72vh; display: grid; align-items: end; }
    .hero img { position: absolute; inset: 0; width: 100%; height: 100%; filter: saturate(1.05); }
    .hero::after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, rgb(26 18 12 / .25), rgb(26 18 12 / .82)); }
    .hero-copy { position: relative; z-index: 1; padding: 28px 22px 36px; max-width: 640px; }
    h1 { font-family: Fraunces, Georgia, serif; font-weight: 500; font-size: clamp(40px, 9vw, 72px); line-height: 1.02; margin: 0 0 12px; letter-spacing: -0.03em; }
    .lead { margin: 0; max-width: 36ch; color: #eadfce; line-height: 1.55; }
    .cta { margin-top: 22px; background: #7c3aed; color: #f8fafc; border: 0; height: 46px; padding: 0 20px; border-radius: 999px; font-weight: 600; }
    section { padding: 36px 22px; }
    h2 { font-family: Fraunces, Georgia, serif; font-size: clamp(28px, 5vw, 40px); font-weight: 500; margin: 0 0 18px; }
    .menu { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
    .dish { background: #241810; border-radius: 20px; overflow: hidden; }
    .dish img { width: 100%; height: 150px; }
    .dish div { padding: 12px 14px 16px; display: flex; justify-content: space-between; gap: 8px; }
    .seat { width: 100%; height: 240px; border-radius: 20px; }
    form { margin-top: 8px; display: grid; gap: 10px; max-width: 440px; }
    input, select { height: 46px; border-radius: 12px; border: 1px solid #3d2b20; background: #241810; color: #f6efe6; padding: 0 12px; }
    .ok { min-height: 1.2em; color: #f0c9a0; font-size: 14px; }
    @media (max-width: 520px) { nav { display: none; } }
    `, `
    <header>
      <div class="mark">${tx("app.cafe.title")}</div>
      <nav><span>${tx("app.cafe.navMenu")}</span><span>${tx("app.cafe.navTables")}</span><span>${tx("app.cafe.addr")}</span></nav>
    </header>
    <div class="hero">
      <img src="${hero}" alt=""/>
      <div class="hero-copy">
        <h1>${tx("app.cafe.h1")}</h1>
        <p class="lead">${tx("app.cafe.lead")}</p>
        <button class="cta" onclick="document.getElementById('book').scrollIntoView({behavior:'smooth'})">${tx("app.cafe.cta")}</button>
      </div>
    </div>
    <section>
      <h2>${tx("app.cafe.menu")}</h2>
      <div class="menu">
        <article class="dish"><img src="${latte}" alt=""/><div><b>${tx("app.cafe.item2")}</b><span>1,80</span></div></article>
        <article class="dish"><img src="${asset("mem-coffee.jpg")}" alt=""/><div><b>${tx("app.cafe.item1")}</b><span>1,40</span></div></article>
        <article class="dish"><img src="${bread}" alt=""/><div><b>${tx("app.cafe.item3")}</b><span>1,60</span></div></article>
        <article class="dish"><img src="${cake}" alt=""/><div><b>${tx("app.cafe.item4")}</b><span>4,20</span></div></article>
      </div>
    </section>
    <section>
      <img class="seat" src="${seat}" alt=""/>
    </section>
    <section id="book">
      <h2>${tx("app.cafe.book")}</h2>
      <form onsubmit="event.preventDefault(); document.getElementById('msg').textContent='${tx("app.cafe.booked").replaceAll("'", "\\'")}';">
        <input required placeholder="${tx("app.cafe.name")}"/>
        <select><option>${tx("app.cafe.slot1")}</option><option>${tx("app.cafe.slot2")}</option><option>${tx("app.cafe.slot3")}</option></select>
        <button class="cta" type="submit">${tx("app.cafe.confirm")}</button>
        <div class="ok" id="msg"></div>
      </form>
    </section>
    `, "", locale);
}
function buildTodoHtml(locale: Locale = "en") {
	const tx = (k: Parameters<typeof t>[1], vars?: Record<string, string | number>) => t(locale, k, vars);
	const desk = asset("todo-desk.jpg");
	return shell(tx("app.todo.title"), `
    body { background: #10241c; color: #eef6f0; }
    .hero { position: relative; height: 220px; }
    .hero img { width: 100%; height: 100%; }
    .hero::after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, rgb(16 36 28 / .15), #10241c); }
    .hero-copy { position: absolute; left: 20px; bottom: 16px; z-index: 1; }
    h1 { font-family: Fraunces, Georgia, serif; font-size: 40px; margin: 0; font-weight: 500; }
    .hero-copy p { margin: 4px 0 0; color: #c6ddd0; }
    .wrap { max-width: 560px; margin: 0 auto; padding: 8px 16px 64px; }
    form { display: flex; gap: 8px; }
    input { flex: 1; height: 48px; border-radius: 14px; border: 1px solid #2c4a3c; background: #183228; color: inherit; padding: 0 14px; }
    button.add { height: 48px; padding: 0 16px; border: 0; border-radius: 14px; background: #3dcc8a; color: #082016; font-weight: 600; }
    ul { list-style: none; padding: 16px 0 0; margin: 0; display: grid; gap: 8px; }
    li { display: flex; align-items: center; gap: 10px; padding: 12px 14px; background: #183228; border-radius: 16px; }
    li img { width: 40px; height: 40px; border-radius: 10px; }
    li.done span { text-decoration: line-through; color: #7fa38f; }
    li button { margin-left: auto; background: none; border: 0; color: #7fa38f; }
    .meta { font-size: 12px; color: #7fa38f; margin-top: 16px; }
    `, `
    <div class="hero">
      <img src="${desk}" alt="Taccuino"/>
      <div class="hero-copy">
        <h1>${tx("app.todo.title")}</h1>
        <p>${tx("app.todo.lead")}</p>
      </div>
    </div>
    <div class="wrap">
      <form id="f"><input id="i" placeholder="${tx("app.todo.ph")}" autocomplete="off"/><button class="add" type="submit">${tx("app.todo.add")}</button></form>
      <ul id="list"></ul>
      <div class="meta" id="meta"></div>
    </div>
    `, `
    const list = document.getElementById('list');
    const meta = document.getElementById('meta');
    const thumbs = ${JSON.stringify([
		asset("mem-lemon.jpg"),
		asset("mem-coffee.jpg"),
		asset("mem-flower.jpg"),
		asset("mem-bread.jpg")
	])};
    const items = [
      {t:${JSON.stringify(tx("app.todo.t1"))}, done:false},
      {t:${JSON.stringify(tx("app.todo.t2"))}, done:false},
      {t:${JSON.stringify(tx("app.todo.t3"))}, done:true}
    ];
    const removeLbl = ${JSON.stringify(tx("app.todo.remove"))};
    const openTpl = ${JSON.stringify(tx("app.todo.open"))};
    function render(){
      list.innerHTML = items.map((it,i)=>'<li class="'+(it.done?'done':'')+'"><img src="'+thumbs[i%thumbs.length]+'" alt=""/><input type="checkbox" '+(it.done?'checked':'')+' data-i="'+i+'"/><span>'+it.t+'</span><button data-d="'+i+'">'+removeLbl+'</button></li>').join('');
      meta.textContent = openTpl.replace('{n}', String(items.filter(x=>!x.done).length));
    }
    document.getElementById('f').onsubmit = (e) => {
      e.preventDefault();
      const v = document.getElementById('i').value.trim();
      if(!v) return;
      items.unshift({t:v, done:false});
      document.getElementById('i').value='';
      render();
    };
    list.onclick = (e) => {
      const t = e.target;
      if(t.dataset.i!=null){ items[+t.dataset.i].done = t.checked; render(); }
      if(t.dataset.d!=null){ items.splice(+t.dataset.d,1); render(); }
    };
    render();
    `, locale);
}
function buildMemoryHtml(locale: Locale = "en") {
	const tx = (k: Parameters<typeof t>[1], vars?: Record<string, string | number>) => t(locale, k, vars);
	const photos = [
		asset("mem-lemon.jpg"),
		asset("mem-coffee.jpg"),
		asset("mem-wine.jpg"),
		asset("mem-olive.jpg"),
		asset("mem-bread.jpg"),
		asset("mem-tomato.jpg"),
		asset("mem-flower.jpg"),
		asset("mem-sea.jpg")
	];
	return shell(tx("app.memory.title"), `
    body { background: #14110e; color: #f6efe6; }
    .wrap { max-width: 480px; margin: 0 auto; padding: 22px 14px 48px; }
    h1 { font-family: Fraunces, Georgia, serif; font-weight: 500; font-size: 36px; margin: 0; }
    p { color: #c4b8a8; margin: 6px 0 14px; }
    .bar { display: flex; justify-content: space-between; font-variant-numeric: tabular-nums; font-size: 13px; color: #c4b8a8; margin-bottom: 14px; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
    .card { aspect-ratio: 1; border: 0; padding: 0; border-radius: 14px; overflow: hidden; background: #2a221c; }
    .card img { width: 100%; height: 100%; transform: scale(1.02); }
    .card .back { width: 100%; height: 100%; background:
      radial-gradient(circle at 30% 20%, #7c3aed, transparent 45%),
      #2a221c; }
    .card.ok { outline: 2px solid #3dcc8a; }
    button.again { margin-top: 18px; height: 44px; padding: 0 16px; border-radius: 999px; border: 0; background: #7c3aed; color: #f8fafc; font-weight: 600; }
    `, `
    <div class="wrap">
      <h1>${tx("app.memory.title")}</h1>
      <p>${tx("app.memory.lead")}</p>
      <div class="bar"><span id="moves">${tx("app.memory.moves", { n: 0 })}</span><span id="left">${tx("app.memory.pairs", { n: 8 })}</span></div>
      <div class="grid" id="grid"></div>
      <button class="again" id="again">${tx("app.memory.again")}</button>
    </div>
    `, `
    const PHOTOS = ${JSON.stringify(photos)};
    let deck, open, lock, moves, left;
    const grid = document.getElementById('grid');
    function start(){
      deck = [...PHOTOS, ...PHOTOS].sort(()=>Math.random()-0.5).map((src)=>({src,on:false,ok:false}));
      open = []; lock = false; moves = 0; left = 8;
      render();
    }
    function render(){
      document.getElementById('moves').textContent = ${JSON.stringify(tx("app.memory.moves"))}.replace('{n}', String(moves));
      document.getElementById('left').textContent = ${JSON.stringify(tx("app.memory.pairs"))}.replace('{n}', String(left));
      grid.innerHTML = deck.map((c,i)=>'<button class="card '+(c.ok?'ok':'')+'" data-i="'+i+'">'+(c.on||c.ok?'<img src="'+c.src+'" alt="carta"/>':'<div class="back"></div>')+'</button>').join('');
    }
    grid.onclick = (e) => {
      const btn = e.target.closest('.card'); if(!btn || lock) return;
      const c = deck[+btn.dataset.i]; if(c.on||c.ok) return;
      c.on = true; open.push(c); render();
      if(open.length<2) return;
      moves++;
      if(open[0].src===open[1].src){ open[0].ok=open[1].ok=true; open=[]; left--; render(); }
      else { lock=true; setTimeout(()=>{ open.forEach(x=>x.on=false); open=[]; lock=false; render(); }, 700); }
    };
    document.getElementById('again').onclick = start;
    start();
    `, locale);
}
function buildDashboardHtml(locale: Locale = "en") {
	const tx = (k: Parameters<typeof t>[1], vars?: Record<string, string | number>) => t(locale, k, vars);
	const store = asset("dash-store.jpg");
	return shell(tx("app.dash.title"), `
    body { background: #0c1418; color: #eef4f2; }
    .hero { position: relative; height: 200px; }
    .hero img { width: 100%; height: 100%; }
    .hero::after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, rgb(12 20 24 / .2), #0c1418); }
    .hero-copy { position: absolute; z-index: 1; left: 20px; bottom: 16px; }
    h1 { font-family: Fraunces, Georgia, serif; font-size: 34px; margin: 0; font-weight: 500; }
    .sub { margin: 4px 0 0; color: #b7c6c4; font-size: 14px; }
    .wrap { padding: 8px 18px 48px; max-width: 880px; margin: 0 auto; }
    .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; }
    .kpi { background: #152226; border-radius: 18px; padding: 14px; overflow: hidden; }
    .kpi:nth-child(1) { background: #7c3aed; color: #f8fafc; }
    .kpi b { display: block; font-family: Fraunces, Georgia, serif; font-size: 28px; letter-spacing: -0.03em; }
    .kpi span { font-size: 12px; opacity: .75; }
    h2 { margin: 28px 0 12px; font-size: 13px; letter-spacing: 0.12em; text-transform: uppercase; color: #8aa3a8; font-weight: 500; }
    .bars { display: grid; gap: 12px; }
    .bar { display: grid; grid-template-columns: 80px 1fr 40px; gap: 10px; align-items: center; font-size: 13px; }
    .track { height: 12px; background: #1c2c32; border-radius: 99px; overflow: hidden; }
    .fill { height: 100%; background: #7c3aed; border-radius: 99px; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th { text-align: left; color: #8aa3a8; font-weight: 500; font-size: 12px; padding: 8px 0; }
    td { padding: 10px 0; border-top: 1px solid #22343a; }
    td img { width: 36px; height: 36px; border-radius: 10px; }
    .who { display: flex; align-items: center; gap: 10px; }
    `, `
    <div class="hero">
      <img src="${store}" alt="Negozio"/>
      <div class="hero-copy">
        <h1>${tx("app.dash.title")}</h1>
        <p class="sub">${tx("app.dash.sub")}</p>
      </div>
    </div>
    <div class="wrap">
      <div class="kpis">
        <div class="kpi"><b>€ 48.2k</b><span>${tx("app.dash.rev")}</span></div>
        <div class="kpi"><b>312</b><span>${tx("app.dash.orders")}</span></div>
        <div class="kpi"><b>4.1%</b><span>${tx("app.dash.conv")}</span></div>
        <div class="kpi"><b>€ 154</b><span>${tx("app.dash.ticket")}</span></div>
      </div>
      <h2>${tx("app.dash.channels")}</h2>
      <div class="bars">
        <div class="bar"><span>${tx("app.dash.store")}</span><div class="track"><div class="fill" style="width:82%"></div></div><span>82%</span></div>
        <div class="bar"><span>${tx("app.dash.online")}</span><div class="track"><div class="fill" style="width:64%"></div></div><span>64%</span></div>
        <div class="bar"><span>${tx("app.dash.wholesale")}</span><div class="track"><div class="fill" style="width:41%"></div></div><span>41%</span></div>
      </div>
      <h2>${tx("app.dash.last")}</h2>
      <table>
        <thead><tr><th>${tx("app.dash.client")}</th><th>${tx("app.dash.city")}</th><th>${tx("app.dash.total")}</th></tr></thead>
        <tbody>
          <tr><td class="who"><img src="${asset("port-chair.jpg")}" alt=""/>Atelier Mora</td><td>Milano</td><td>€ 1.240</td></tr>
          <tr><td class="who"><img src="${asset("port-brand.jpg")}" alt=""/>Studio Luce</td><td>Torino</td><td>€ 680</td></tr>
          <tr><td class="who"><img src="${asset("port-house.jpg")}" alt=""/>Casa Nord</td><td>Bolzano</td><td>€ 2.110</td></tr>
        </tbody>
      </table>
    </div>
    `, "", locale);
}
function buildPortfolioHtml(locale: Locale = "en") {
	const tx = (k: Parameters<typeof t>[1], vars?: Record<string, string | number>) => t(locale, k, vars);
	return shell(tx("app.port.title"), `
    body { background: #111110; color: #f2f0ea; }
    header { padding: 22px 20px; display: flex; justify-content: space-between; align-items: center; }
    .mark { letter-spacing: 0.16em; text-transform: uppercase; font-size: 12px; }
    h1 { font-family: Fraunces, Georgia, serif; font-weight: 500; font-size: clamp(34px, 7vw, 58px); line-height: 1.05; margin: 8px 20px 10px; max-width: 14ch; }
    .lead { margin: 0 20px 24px; max-width: 40ch; color: #b7b4ab; line-height: 1.55; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 0 20px 48px; }
    .tile { position: relative; min-height: 180px; border-radius: 16px; overflow: hidden; }
    .tile img { width: 100%; height: 100%; min-height: 180px; }
    .tile:first-child { grid-column: 1 / -1; min-height: 260px; }
    .tile:first-child img { min-height: 260px; }
    .tile b { position: absolute; left: 14px; bottom: 14px; font-weight: 500; text-shadow: 0 1px 8px rgb(0 0 0 / .5); }
    form { margin: 0 20px 56px; display: grid; gap: 10px; max-width: 420px; }
    input { height: 46px; border-radius: 12px; border: 1px solid #2c2a26; background: #1a1916; color: inherit; padding: 0 12px; }
    .cta { height: 46px; border: 0; border-radius: 999px; background: #f2f0ea; color: #111110; font-weight: 600; }
    .ok { color: #c4b8a4; min-height: 1.2em; }
    @media (max-width: 520px){ .grid { grid-template-columns: 1fr; } }
    `, `
    <header><div class="mark">${tx("app.port.title")}</div><div>Milano</div></header>
    <h1>${tx("app.port.h1")}</h1>
    <p class="lead">${tx("app.port.lead")}</p>
    <div class="grid">
      <div class="tile"><img src="${asset("port-house.jpg")}" alt=""/><b>${tx("app.port.p1")}</b></div>
      <div class="tile"><img src="${asset("port-brand.jpg")}" alt=""/><b>${tx("app.port.p2")}</b></div>
      <div class="tile"><img src="${asset("port-chair.jpg")}" alt=""/><b>${tx("app.port.p3")}</b></div>
    </div>
    <form onsubmit="event.preventDefault(); document.getElementById('ok').textContent='${tx("app.port.sent").replaceAll("'", "\\'")}';">
      <input required placeholder="${tx("app.port.name")}"/>
      <input type="email" required placeholder="${tx("app.port.mail")}"/>
      <button class="cta" type="submit">${tx("app.port.cta")}</button>
      <div class="ok" id="ok"></div>
    </form>
    `, "", locale);
}
export function buildGenericHtml(prompt: string, locale: Locale = "en") {
  const tx = (k: Parameters<typeof t>[1], vars?: Record<string, string | number>) => t(locale, k, vars);
  return shell(
    "Helix",
    `
    body { background: #070914; color: #f8fafc; margin: 0; min-height: 100vh; display: grid; place-items: center; text-align: center; padding: 32px; }
    p.k { letter-spacing: 0.2em; text-transform: uppercase; font-size: 11px; color: #9b6cff; }
    h1 { font-family: Fraunces, Georgia, serif; font-style: italic; font-weight: 500; font-size: clamp(28px, 6vw, 42px); margin: 12px 0 0; }
    p.l { margin-top: 14px; color: #aab3c5; max-width: 28rem; line-height: 1.5; }
    .orb { width: 88px; height: 88px; margin: 0 auto 18px; position: relative; }
    .orb span { position: absolute; inset: 0; border-radius: 50%; }
    .glow { background: rgb(124 58 237 / .35); animation: ping 1.6s ease-out infinite; }
    .core { inset: 14%; background: radial-gradient(circle at 32% 28%, #ddd6fe, #7c3aed 55%, #2e1065); box-shadow: 0 0 32px rgb(124 58 237 / .5); }
    .ring { inset: 6% 4% 38%; border: 2px solid #fff; border-radius: 100%; transform: rotate(-22deg); animation: spin 7s linear infinite; }
    @keyframes ping { 0% { transform: scale(.85); opacity: .8; } 100% { transform: scale(1.35); opacity: 0; } }
    @keyframes spin { to { transform: rotate(338deg); } }
    `,
    `
    <div class="orb" aria-hidden="true"><span class="glow"></span><span class="core"></span><span class="ring"></span></div>
    <p class="k">Helix</p>
    <h1>${tx("app.gen.kicker")}</h1>
    <p class="l">${tx("app.gen.lead")}</p>
    `,
    "",
    locale,
  );
}

function buildMaisonHtml(locale: Locale = "en") {
	const tx = (k: Parameters<typeof t>[1], vars?: Record<string, string | number>) => t(locale, k, vars);
	const looks = [
		{
			id: "l1",
			name: tx("app.mai.l1"),
			price: 420,
			img: asset("port-chair.jpg"),
			note: tx("app.mai.n1")
		},
		{
			id: "l2",
			name: tx("app.mai.l2"),
			price: 280,
			img: asset("port-brand.jpg"),
			note: tx("app.mai.n2")
		},
		{
			id: "l3",
			name: tx("app.mai.l3"),
			price: 190,
			img: asset("cafe-seat.jpg"),
			note: tx("app.mai.n3")
		}
	];
	return shell(tx("app.mai.title"), `
    body { background: #0e0c0b; color: #f4efe8; margin: 0; }
    header { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; }
    .mark { font-family: Fraunces, Georgia, serif; font-style: italic; font-size: 22px; }
    button { font-family: inherit; cursor: pointer; }
    #bagBtn { height: 40px; padding: 0 14px; border-radius: 999px; border: 1px solid #3a332c; background: transparent; color: inherit; }
    .stage { position: relative; height: 42vh; min-height: 220px; }
    .stage img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .thumbs { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; padding: 8px 12px 0; }
    .thumbs button { padding: 0; border: 2px solid transparent; border-radius: 10px; overflow: hidden; background: #1a1614; height: 64px; }
    .thumbs button.on { border-color: #f4efe8; }
    .thumbs img { width: 100%; height: 64px; object-fit: cover; display: block; }
    .panel { padding: 14px 16px 24px; }
    h1 { font-family: Fraunces, Georgia, serif; font-weight: 500; font-size: 28px; margin: 0 0 4px; }
    .note { color: #c9bfb4; font-size: 14px; line-height: 1.45; margin: 0 0 12px; }
    .row { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px; }
    .price { font-family: Fraunces, Georgia, serif; font-size: 28px; }
    .sizes { display: flex; gap: 8px; }
    .sizes button { width: 48px; height: 48px; border-radius: 999px; border: 1px solid #3a332c; background: #1a1614; color: inherit; font-weight: 600; }
    .sizes button.on { background: #f4efe8; color: #0e0c0b; border-color: #f4efe8; }
    .add { width: 100%; height: 50px; border: 0; border-radius: 999px; background: #7c3aed; color: #f8fafc; font-weight: 600; font-size: 15px; }
    #sheet { display: none; position: fixed; inset: 0; background: rgb(14 12 11 / .72); z-index: 8; }
    #sheet.open { display: grid; place-items: end center; }
    #sheet .box { width: 100%; background: #161412; border-radius: 20px 20px 0 0; padding: 20px 16px 28px; max-height: 80%; overflow: auto; }
    #sheet h2 { font-family: Fraunces, Georgia, serif; font-weight: 500; margin: 0 0 12px; }
    #lines { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
    #lines li { display: flex; justify-content: space-between; align-items: center; font-size: 14px; }
    #lines button { border: 0; background: none; color: #c9bfb4; }
    .pay { width: 100%; height: 50px; margin-top: 14px; border: 0; border-radius: 999px; background: #f4efe8; color: #0e0c0b; font-weight: 600; }
    .done { text-align: center; padding: 20px 8px; display: none; }
    .done p { font-family: Fraunces, Georgia, serif; font-size: 26px; margin: 0 0 8px; }
    `, `
    <header>
      <div class="mark">${tx("app.mai.title")}</div>
      <button type="button" id="bagBtn">${tx("app.mai.bag")} · <span id="count">0</span></button>
    </header>
    <div class="stage"><img id="photo" src="${looks[0].img}" alt=""/></div>
    <div class="thumbs">
      ${looks.map((l, i) => `<button type="button" class="${i === 0 ? "on" : ""}" data-i="${i}"><img src="${l.img}" alt="${escapeHtml(l.name)}"/></button>`).join("")}
    </div>
    <div class="panel">
      <h1 id="name">${escapeHtml(looks[0].name)}</h1>
      <p class="note" id="note">${escapeHtml(looks[0].note)}</p>
      <div class="row">
        <div class="sizes" id="sizes">
          <button type="button" class="on" data-s="S">S</button>
          <button type="button" data-s="M">M</button>
          <button type="button" data-s="L">L</button>
        </div>
        <div class="price" id="price">€ ${looks[0].price}</div>
      </div>
      <button type="button" class="add" id="add">${tx("app.mai.add")}</button>
    </div>
    <div id="sheet">
      <div class="box">
        <div id="cartView">
          <h2>${tx("app.mai.bag")}</h2>
          <ul id="lines"></ul>
          <p class="price" id="tot">€ 0</p>
          <button type="button" class="pay" id="pay">${tx("app.mai.pay")}</button>
        </div>
        <div class="done" id="done">
          <p>${tx("app.mai.thanks")}</p>
          <span id="ref"></span>
        </div>
      </div>
    </div>
    `, `
    (function(){
      var looks = ${JSON.stringify(looks)};
      var i = 0, size = 'S', bag = [];
      function $(id){ return document.getElementById(id); }
      function show(){
        var l = looks[i];
        $('photo').src = l.img;
        $('name').textContent = l.name;
        $('note').textContent = l.note;
        $('price').textContent = '€ ' + l.price;
        document.querySelectorAll('.thumbs button').forEach(function(b, n){ b.className = n===i ? 'on' : ''; });
      }
      function drawBag(){
        $('count').textContent = bag.length;
        $('lines').innerHTML = bag.map(function(x, n){
          return '<li><span>'+x.name+' · '+x.size+'</span><span>€ '+x.price+' <button type="button" data-rm="'+n+'">×</button></span></li>';
        }).join('') || '<li>${tx("app.mai.empty")}</li>';
        var sum = bag.reduce(function(a,x){ return a+x.price; }, 0);
        $('tot').textContent = '€ ' + sum;
      }
      document.querySelectorAll('.thumbs button').forEach(function(b){
        b.addEventListener('click', function(){ i = +b.getAttribute('data-i'); show(); });
      });
      document.querySelectorAll('#sizes button').forEach(function(b){
        b.addEventListener('click', function(){
          size = b.getAttribute('data-s');
          document.querySelectorAll('#sizes button').forEach(function(x){ x.className = ''; });
          b.className = 'on';
        });
      });
      $('add').addEventListener('click', function(){
        var l = looks[i];
        bag.push({ name: l.name, size: size, price: l.price });
        drawBag();
        $('sheet').className = 'open';
        $('cartView').style.display = 'block';
        $('done').style.display = 'none';
      });
      $('bagBtn').addEventListener('click', function(){
        $('sheet').className = $('sheet').className === 'open' ? '' : 'open';
      });
      $('sheet').addEventListener('click', function(e){
        if (e.target === $('sheet')) $('sheet').className = '';
        var rm = e.target.getAttribute && e.target.getAttribute('data-rm');
        if (rm != null) { bag.splice(+rm,1); drawBag(); }
      });
      $('pay').addEventListener('click', function(){
        if (!bag.length) return;
        $('cartView').style.display = 'none';
        $('done').style.display = 'block';
        $('ref').textContent = 'VALE–' + (1000 + bag.length * 17);
        bag = [];
        drawBag();
      });
    })();
    `, locale);
}
function buildCantinaHtml(locale: Locale = "en") {
	const tx = (k: Parameters<typeof t>[1], vars?: Record<string, string | number>) => t(locale, k, vars);
	return shell(tx("app.vin.title"), `
    body { background: #140e0c; color: #f6efe6; }
    header { padding: 20px 22px; display: flex; justify-content: space-between; font-size: 13px; letter-spacing: .14em; text-transform: uppercase; }
    .hero { position: relative; min-height: 70vh; display: grid; align-items: end; }
    .hero img { position: absolute; inset: 0; width: 100%; height: 100%; }
    .hero::after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, rgb(20 14 12 / .15), #140e0c); }
    .hero-copy { position: relative; z-index: 1; padding: 28px 22px 32px; }
    h1 { font-family: Fraunces, Georgia, serif; font-weight: 500; font-size: clamp(40px, 9vw, 76px); line-height: 1; margin: 0 0 12px; }
    .lead { max-width: 38ch; color: #e4d4c4; }
    .cta { margin-top: 20px; height: 46px; padding: 0 20px; border: 0; border-radius: 999px; background: #c4a574; color: #1a120c; font-weight: 600; }
    section { padding: 32px 22px; }
    h2 { font-family: Fraunces, Georgia, serif; font-size: clamp(28px, 5vw, 40px); font-weight: 500; }
    .wines { display: grid; gap: 12px; }
    .wine { display: grid; grid-template-columns: 96px 1fr auto; gap: 12px; align-items: center; background: #1d1512; border-radius: 18px; overflow: hidden; }
    .wine img { width: 96px; height: 96px; }
    .wine b { font-family: Fraunces, Georgia, serif; font-weight: 500; }
    .wine span { display: block; font-size: 13px; color: #c4b4a4; }
    form { display: grid; gap: 10px; max-width: 420px; }
    input, select { height: 46px; border-radius: 12px; border: 1px solid #3d2b20; background: #1d1512; color: inherit; padding: 0 12px; }
    .ok { color: #c4a574; min-height: 1.2em; }
    `, `
    <header><span>${tx("app.vin.title")}</span><span>Langhe</span></header>
    <div class="hero">
      <img src="${asset("mem-wine.jpg")}" alt=""/>
      <div class="hero-copy">
        <h1>${tx("app.vin.h1")}</h1>
        <p class="lead">${tx("app.vin.lead")}</p>
        <button class="cta" onclick="document.getElementById('taste').scrollIntoView({behavior:'smooth'})">${tx("app.vin.cta")}</button>
      </div>
    </div>
    <section>
      <h2>${tx("app.vin.list")}</h2>
      <div class="wines">
        <article class="wine"><img src="${asset("mem-olive.jpg")}" alt=""/><div><b>${tx("app.vin.w1")}</b><span>Barolo · 2018</span></div><b>68</b></article>
        <article class="wine"><img src="${asset("mem-tomato.jpg")}" alt=""/><div><b>${tx("app.vin.w2")}</b><span>Barbaresco · 2019</span></div><b>54</b></article>
        <article class="wine"><img src="${asset("mem-lemon.jpg")}" alt=""/><div><b>${tx("app.vin.w3")}</b><span>Arneis · 2023</span></div><b>22</b></article>
      </div>
    </section>
    <section id="taste">
      <h2>${tx("app.vin.taste")}</h2>
      <form onsubmit="event.preventDefault(); document.getElementById('ok').textContent='${tx("app.vin.booked").replaceAll("'", "\\'")}';">
        <input required placeholder="${tx("app.vin.name")}"/>
        <select><option>${tx("app.vin.s1")}</option><option>${tx("app.vin.s2")}</option><option>${tx("app.vin.s3")}</option></select>
        <button class="cta" type="submit">${tx("app.vin.cta")}</button>
        <div class="ok" id="ok"></div>
      </form>
    </section>
    `, "", locale);
}
function buildSoftwareHtml(locale: Locale = "en") {
	const tx = (k: Parameters<typeof t>[1], vars?: Record<string, string | number>) => t(locale, k, vars);
	return shell(tx("app.soft.title"), `
    body { background:#0b1020; color:#e8edf7; }
    .app { display:grid; grid-template-columns: 220px 1fr; min-height:100vh; }
    aside { background:#12182a; padding:20px 14px; border-right:1px solid #243049; }
    .mark { font-family:Fraunces,Georgia,serif; font-size:22px; margin:0 8px 18px; }
    nav button { display:block; width:100%; text-align:left; background:transparent; border:0; color:#b7c0d4; padding:10px 12px; border-radius:10px; font-size:14px; }
    nav button.on { background:#7c3aed; color:#fff; }
    main { padding:22px 24px 48px; }
    .bar { display:flex; gap:10px; align-items:center; margin-bottom:18px; }
    .bar input { flex:1; height:42px; border-radius:10px; border:1px solid #2a3550; background:#161d30; color:inherit; padding:0 12px; }
    .bar .cta { height:42px; padding:0 16px; border:0; border-radius:10px; background:#7c3aed; color:#fff; font-weight:600; }
    .kpis { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:16px; }
    .kpi { background:#161d30; border-radius:14px; padding:14px 16px; }
    .kpi b { display:block; font-size:22px; }
    .kpi span { font-size:12px; color:#93a0b8; }
    table { width:100%; border-collapse:collapse; background:#161d30; border-radius:14px; overflow:hidden; }
    th,td { text-align:left; padding:10px 12px; border-bottom:1px solid #243049; font-size:14px; }
    th { color:#93a0b8; font-weight:500; }
    .chip { font-size:11px; padding:3px 8px; border-radius:999px; background:#243049; }
    .chip.ok { background:#14532d; color:#bbf7d0; }
    .chip.warn { background:#7c2d12; color:#fed7aa; }
    .view { display:none; }
    .view.on { display:block; }
    form { display:grid; gap:8px; max-width:420px; margin-top:12px; }
    form input { height:42px; border-radius:10px; border:1px solid #2a3550; background:#0b1020; color:inherit; padding:0 12px; }
    @media (max-width:720px){ .app{grid-template-columns:1fr} aside{display:flex; gap:8px; overflow:auto} nav{display:flex} .kpis{grid-template-columns:1fr} }
  `, `
    <div class="app">
      <aside>
        <p class="mark">${tx("app.soft.title")}</p>
        <nav>
          <button class="on" data-v="dash">${tx("app.soft.navDash")}</button>
          <button data-v="cli">${tx("app.soft.navCli")}</button>
          <button data-v="inv">${tx("app.soft.navInv")}</button>
          <button data-v="items">${tx("app.soft.navItems")}</button>
        </nav>
      </aside>
      <main>
        <div class="bar">
          <input id="q" placeholder="${tx("app.soft.search")}"/>
          <button class="cta" id="new">${tx("app.soft.new")}</button>
        </div>
        <section class="view on" id="dash">
          <div class="kpis">
            <div class="kpi"><b id="k1">€12.480</b><span>${tx("app.soft.rev")}</span></div>
            <div class="kpi"><b id="k2">8</b><span>${tx("app.soft.open")}</span></div>
            <div class="kpi"><b id="k3">2</b><span>${tx("app.soft.late")}</span></div>
          </div>
          <table id="dashT"></table>
        </section>
        <section class="view" id="cli"><table id="cliT"></table></section>
        <section class="view" id="inv">
          <table id="invT"></table>
          <form id="f"><input id="who" placeholder="Rossi srl"/><input id="amt" type="number" value="420"/><button class="cta" type="submit">${tx("app.soft.new")}</button></form>
        </section>
        <section class="view" id="items"><table id="itT"></table></section>
      </main>
    </div>
  `, `
    const inv = [
      {n:'FT-1041', c:'Rossi srl', e:2480, s:'open'},
      {n:'FT-1040', c:'Neri SPA', e:890, s:'paid'},
      {n:'FT-1039', c:'Bianchi', e:320, s:'late'},
      {n:'FT-1038', c:'Verde Lab', e:1560, s:'paid'},
      {n:'FT-1037', c:'Costa', e:210, s:'open'},
      {n:'FT-1036', c:'Luna Design', e:980, s:'paid'}
    ];
    const cli = ['Rossi srl','Neri SPA','Bianchi','Verde Lab','Costa','Luna Design'];
    const items = [['Seduta A3','€180'],['Lampada Halo','€92'],['Tavolo Nord','€640']];
    const chip = s => s==='paid'?'ok':s==='late'?'warn':'';
    function rows(list){
      return '<tr><th>#</th><th>Cliente</th><th>€</th><th></th></tr>'+list.map(r=>'<tr><td>'+r.n+'</td><td>'+r.c+'</td><td>'+r.e+'</td><td><span class="chip '+chip(r.s)+'">'+r.s+'</span></td></tr>').join('');
    }
    function draw(q=''){
      const f = inv.filter(r => (r.n+r.c).toLowerCase().includes(q.toLowerCase()));
      dashT.innerHTML = rows(f);
      invT.innerHTML = rows(f);
      cliT.innerHTML = '<tr><th>Cliente</th></tr>'+cli.filter(c=>c.toLowerCase().includes(q.toLowerCase())).map(c=>'<tr><td>'+c+'</td></tr>').join('');
      itT.innerHTML = '<tr><th>Articolo</th><th></th></tr>'+items.map(i=>'<tr><td>'+i[0]+'</td><td>'+i[1]+'</td></tr>').join('');
    }
    draw();
    q.oninput = () => draw(q.value);
    document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{
      document.querySelectorAll('nav button').forEach(x=>x.classList.remove('on'));
      document.querySelectorAll('.view').forEach(x=>x.classList.remove('on'));
      b.classList.add('on');
      document.getElementById(b.dataset.v).classList.add('on');
    });
    f.onsubmit = e => {
      e.preventDefault();
      inv.unshift({n:'FT-'+(1000+inv.length+40), c:who.value||'Nuovo', e:+amt.value||0, s:'open'});
      draw(q.value);
    };
    new.onclick = () => { document.querySelector('[data-v=inv]').click(); who.focus(); };
  `, locale);
}
export function htmlForPrompt(prompt: string, locale: Locale = "en") {
	switch (matchTemplate(prompt)) {
		case "orbit-command": return buildFlagshipHtml("orbit-command", locale);
		case "neura": return buildFlagshipHtml("neura", locale);
		case "synapse": return buildFlagshipHtml("synapse", locale);
		case "vanta": return buildFlagshipHtml("vanta", locale);
		case "arc-city": return buildFlagshipHtml("arc-city", locale);
		case "morph": return buildFlagshipHtml("morph", locale);
		case "cafe": return buildCafeHtml(locale);
		case "maison": return buildMaisonHtml(locale);
		case "portfolio": return buildPortfolioHtml(locale);
		case "cantina": return buildCantinaHtml(locale);
		case "todo": return buildTodoHtml(locale);
		case "memory": return buildMemoryHtml(locale);
		case "dashboard": return buildDashboardHtml(locale);
		case "software": return buildSoftwareHtml(locale);
		case "aurelia": return buildAureliaHtml(locale);
		case "marea": return buildMareaHtml(locale);
		case "velora": return buildVeloraHtml(locale);
		case "halo": return buildHaloHtml(locale);
		case "sonar": return buildSonarHtml();
		case "mixlab": return buildMixlabHtml();
		case "actstage": return buildActstageHtml();
		default: return buildGenericHtml(prompt, locale);
	}
}
export function archivedFor(locale: Locale = "en") {
	const tx = (k: Parameters<typeof t>[1]) => t(locale, k);
	return [
		{
			id: "sonar",
			title: tx("app.sonar.title"),
			kind: tx("app.sonar.kind"),
			prompt: tx("app.sonar.prompt"),
			fn: tx("app.sonar.fn"),
			cover: "https://images.unsplash.com/photo-1500674425229-f692875b0ab7?auto=format&fit=crop&w=900&q=70"
		},
		{
			id: "mixlab",
			title: tx("app.mix.title"),
			kind: tx("app.mix.kind"),
			prompt: tx("app.mix.prompt"),
			fn: tx("app.mix.fn"),
			cover: "https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=900&q=70"
		},
		{
			id: "actstage",
			title: tx("app.act.title"),
			kind: tx("app.act.kind"),
			prompt: tx("app.act.prompt"),
			fn: tx("app.act.fn"),
			cover: "https://images.unsplash.com/photo-1507676184212-d03ab45efd58?auto=format&fit=crop&w=900&q=70"
		},
		{
			id: "aurelia",
			title: tx("app.aur.title"),
			kind: tx("app.aur.kind"),
			prompt: tx("app.aur.prompt"),
			fn: tx("app.aur.fn"),
			cover: "https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=900&q=70"
		},
		{
			id: "marea",
			title: tx("app.mar.title"),
			kind: tx("app.mar.kind"),
			prompt: tx("app.mar.prompt"),
			fn: tx("app.mar.fn"),
			cover: "https://images.unsplash.com/photo-1567899378494-47b22a2ae96a?auto=format&fit=crop&w=900&q=70"
		},
		{
			id: "velora",
			title: tx("app.vel.title"),
			kind: tx("app.vel.kind"),
			prompt: tx("app.vel.prompt"),
			fn: tx("app.vel.fn"),
			cover: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=900&q=70"
		},
		{
			id: "halo",
			title: tx("app.halo.title"),
			kind: tx("app.halo.kind"),
			prompt: tx("app.halo.prompt"),
			fn: tx("app.halo.fn"),
			cover: "https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=900&q=70"
		},
		{
			id: "cafe",
			title: tx("app.cafe.title"),
			kind: tx("app.cafe.kind"),
			prompt: tx("app.cafe.prompt"),
			fn: tx("app.cafe.fn"),
			cover: asset("cafe-hero.jpg")
		},
		{
			id: "maison",
			title: tx("app.mai.title"),
			kind: tx("app.mai.kind"),
			prompt: tx("app.mai.prompt"),
			fn: tx("app.mai.fn"),
			cover: asset("port-chair.jpg")
		},
		{
			id: "port",
			title: tx("app.port.title"),
			kind: tx("app.port.kind"),
			prompt: tx("app.port.prompt"),
			fn: tx("app.port.fn"),
			cover: asset("port-house.jpg")
		},
		{
			id: "cantina",
			title: tx("app.vin.title"),
			kind: tx("app.vin.kind"),
			prompt: tx("app.vin.prompt"),
			fn: tx("app.vin.fn"),
			cover: asset("mem-wine.jpg")
		},
		{
			id: "memory",
			title: tx("app.memory.title"),
			kind: tx("app.memory.kind"),
			prompt: tx("app.memory.prompt"),
			fn: tx("app.memory.fn"),
			cover: asset("mem-flower.jpg")
		},
		{
			id: "software",
			title: tx("app.soft.title"),
			kind: tx("app.soft.kind"),
			prompt: tx("app.soft.prompt"),
			fn: tx("app.soft.fn"),
			cover: asset("dash-store.jpg")
		},
		{
			id: "dashboard",
			title: tx("app.dash.title"),
			kind: tx("app.dash.kind"),
			prompt: tx("app.dash.prompt"),
			fn: tx("app.dash.fn"),
			cover: asset("dash-store.jpg")
		},
		{
			id: "todo",
			title: tx("app.todo.title"),
			kind: tx("app.todo.kind"),
			prompt: tx("app.todo.prompt"),
			fn: tx("app.todo.fn"),
			cover: asset("todo-desk.jpg")
		}
	];
}
export function featuredFor(locale: Locale = "en") {
	return flagshipFor(locale);
}
export const FEATURED = featuredFor("it");
export function featuredHtml(id: string, locale: Locale = "en") {
	if (isFlagshipId(id)) return buildFlagshipHtml(id, locale);
	switch (id) {
		case "cafe": return buildCafeHtml(locale);
		case "maison": return buildMaisonHtml(locale);
		case "port":
		case "portfolio": return buildPortfolioHtml(locale);
		case "cantina": return buildCantinaHtml(locale);
		case "todo": return buildTodoHtml(locale);
		case "memory": return buildMemoryHtml(locale);
		case "dashboard": return buildDashboardHtml(locale);
		case "software": return buildSoftwareHtml(locale);
		case "aurelia": return buildAureliaHtml(locale);
		case "marea": return buildMareaHtml(locale);
		case "velora": return buildVeloraHtml(locale);
		case "halo": return buildHaloHtml(locale);
		case "sonar": return buildSonarHtml();
		case "mixlab": return buildMixlabHtml();
		case "actstage": return buildActstageHtml();
		default: return buildGenericHtml(id, locale);
	}
}
