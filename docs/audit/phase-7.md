# Audit Helix — Fase 7

Data: 2026-08-20

Stato: **stabilizzata localmente; la verifica browser resta onestamente `NOT_RUN` in questo ambiente**.

## Risolto

- La Vetrina principale contiene esattamente sei flagship: `ORBIT COMMAND`, `NEURA`, `SYNAPSE`, `VANTA`, `ARC CITY` e `MORPH`.
- Le 15 demo precedenti non sono state cancellate. Sono state separate dal catalogo principale e restano raggiungibili nella sezione archivio “Altri esempi”.
- Ogni flagship è un'app HTML autonoma con una propria information architecture, palette, tipografia di sistema, geometria, densità, navigazione e motion language:
  - Orbit Command: mission control perimetrale nero con Canvas orbitale e telemetria;
  - Neura: tavola scientifica chiara e asimmetrica, sempre etichettata come demo non clinica;
  - Synapse: workspace editoriale e knowledge canvas;
  - Vanta: terminale mono ad alta densità, con trading e dati esplicitamente simulati;
  - Arc City: gemello urbano map-first in SVG con livelli e timeline;
  - Morph: configuratore cinematico CSS/SVG con stage prodotto e console fisica.
- Le flagship non condividono una dashboard/sidebar/card shell. Condividono soltanto il reset tecnico, la serializzazione sicura, il `lang` e la gestione reduced-motion.
- Ogni prodotto espone almeno 10 controlli locali e almeno cinque comportamenti distinti. Selezioni, filtri, modalità, timeline, configurazioni e workflow paper aggiornano realmente stato e DOM; non sono semplici badge statici.
- Le sei app sono offline: nessun Unsplash, Google Fonts, foto stock, fetch, WebSocket, storage browser, sink `innerHTML`, `eval` o `document.write`.
- La card flagship mostra un `MiniShot` generato dall'HTML reale dell'app. Il campo `cover` non esiste nel catalogo flagship, quindi una fotografia non può sostituire la UI.
- La Vetrina mostra nome, tipo, prompt originale, capability e prova disponibile. Agenti, build time e Kreluna Score non sono mostrati perché non esiste evidenza persistita e hash-bound per queste demo curate.
- La Home non usa più `featured.slice(0, 3)`. Seleziona esplicitamente Morph, Vanta e Orbit Command per rappresentare prodotto visuale, software professionale e tecnologia futuristica.
- Copy, messaggi di interazione e `aria-label` delle flagship sono centralizzati per italiano, inglese, spagnolo, francese, tedesco e portoghese. Tutti i 36 documenti impostano il corretto `<html lang>`.
- Il locale viene propagato da Home/Vetrina a `/a/$slug` e fino al builder server-side. Un'apertura italiana restituisce realmente la UI italiana.
- Gli slug delle demo integrate sono riservati: il catalogo built-in viene risolto prima del database. Una riga `public_apps` non può oscurare una flagship e una demo integrata resta disponibile anche con DB offline.
- È disponibile `qa:flagships`: esegue Twin, Echo e Swift su tutte e sei le app e richiede almeno otto controlli esercitati, cinque azioni con cambiamento, zero errori e zero richieste esterne. Con `--require-completed` termina in errore se il browser non è disponibile.

## File principali modificati

- `src/lib/flagships/shared.ts`
- `src/lib/flagships/copy.ts`
- `src/lib/flagships/catalog.ts`
- `src/lib/flagships/orbit-command.ts`
- `src/lib/flagships/neura.ts`
- `src/lib/flagships/synapse.ts`
- `src/lib/flagships/vanta.ts`
- `src/lib/flagships/arc-city.ts`
- `src/lib/flagships/morph.ts`
- `src/lib/templates.ts`
- `src/components/project-card.tsx`
- `src/routes/vetrina.tsx`
- `src/routes/index.tsx`
- `src/routes/a.$slug.tsx`
- `src/lib/server/deploy.ts`
- `scripts/flagship-showcase.test.mjs`
- `scripts/flagship-browser.mjs`
- `scripts/netlify-output-smoke.mjs`
- `package.json`

## Verifiche

| Verifica | Risultato |
| --- | --- |
| Typecheck strict | PASS |
| Test repository | PASS — 187/187 |
| Catalogo principale esattamente a 6 e archivio a 15 | PASS |
| 36 render: 6 flagship × 6 locale | PASS |
| `lang`, copy centralizzata e routing locale | PASS |
| Almeno 8 controlli e 5 comportamenti per flagship | PASS statico — il sorgente e i listener sono presenti |
| Aegis su tutti i 36 artefatti | PASS — 0 blocker e 0 finding |
| Assenza URL esterni, stock, rete, storage e sink DOM | PASS |
| Firme visive e cataloghi separati | PASS |
| Home con tre ID espliciti | PASS |
| Card basate sulla UI reale e proof honesty | PASS |
| Lint | PASS — 0 errori, 5 warning non bloccanti nel file legacy `i18n.tsx` |
| Build client + SSR Netlify | PASS |
| Smoke Netlify: SSR, PWA, header, `/api/auth/*`, route Morph italiana e server function reale | PASS |
| Smoke RPC: billing, rate limit, ownership, Human Gate e failure xAI | PASS |
| Twin/Echo/Swift sulle sei flagship | **NOT_RUN — dipendenza Playwright/Chromium assente** |
| Modalità browser obbligatoria | PASS fail-closed — exit code `2`, nessuna certificazione generata |
| Secret scan worktree | PASS — 261 file controllati, 0 finding |
| Dependency audit production (`--omit=dev`) | PASS — 0 vulnerabilità |
| Migrator senza `DATABASE_URL` | PASS — skip esplicito |
| `git diff --check` | PASS |

La build conserva i warning noti PGlite (`eval`) e import `pg` esternalizzati. Il chunk client dei template è circa 247 kB / 66 kB gzip dopo l'aggiunta delle sei app e delle sei locale; non è bloccante, ma va ottimizzato con lazy loading se la Vetrina cresce.

## Migration ed env richieste

- Questa fase non aggiunge migration database.
- Questa fase non aggiunge env obbligatorie.
- Per completare la verifica runtime occorrono Playwright/Chromium nell'ambiente isolato oppure `HELIX_BROWSER_RUNNER_URL` e `HELIX_BROWSER_RUNNER_SECRET` configurati verso il runner già previsto dalla Fase 5.
- Non servono API, immagini esterne, font remoti o credenziali per visualizzare e usare le flagship.

## Ancora aperto

- **NON RISOLTO — test browser reale delle interazioni:** il runner ha prodotto sei report `NOT_RUN` con `browser_dependency_missing`. I controlli e i listener sono verificati staticamente, ma non viene dichiarato che Twin li abbia cliccati.
- **NON RISOLTO — screenshot misurati:** le card usano thumbnail live della vera app; non esistono ancora screenshot Playwright con hash artefatto, hash immagine, viewport e timestamp.
- **NON RISOLTO — visual QA su browser reale:** responsive phone/desktop, overflow, contrasto, focus e screenshot comparison non sono certificati senza Chromium. Le media query e gli attributi accessibili esistono, ma la prova runtime manca.
- **NON RISOLTO — axe completo:** Aegis è verde e i controlli hanno label, ma Echo resta `NOT_RUN` e il runner non integra ancora l'intero catalogo axe-core.
- **NON RISOLTO — performance delle sei preview simultanee:** i MiniShot sono fedeli alla UI, ma alcune app animano Canvas. Serve una misura browser e, se necessario, IntersectionObserver/screenshot locali per ridurre CPU.
- **NON RISOLTO — archivio legacy:** Sonar, Mixlab e Actstage restano in inglese; alcune vecchie demo dipendono da asset remoti che la CSP offline blocca. Sono fuori dalle sei flagship, ma l'archivio richiede una successiva pulizia.
- **NON RISOLTO — localizzazione marketing completa:** le flagship e la loro cornice sono localizzate, ma alcuni prompt rapidi e label legacy della Home/Header restano hardcoded.
- **NON RISOLTO — build time, agent provenance e Score delle flagship:** non sono stati inventati né mostrati. Per pubblicarli serve evidence persistita legata allo SHA-256 dell'artefatto.
- **NON RISOLTO — dipendenze dev Netlify:** resta il finding già documentato di 10 vulnerabilità high transitivamente nella toolchain di sviluppo; la produzione riporta zero vulnerabilità.
- **NON RISOLTO — secret storico:** la credenziale OAuth storica deve ancora essere revocata/ruotata e rimossa dalla cronologia Git coordinata.
- **NON VERIFICATO SU DEPLOY NETLIFY:** il bundle locale e l'handler Netlify passano, ma non è stato pubblicato un deploy preview/production.

## Breaking change

- `featuredFor(locale)` restituisce ora soltanto le sei flagship. I consumer delle vecchie 15 demo devono usare `archivedFor(locale)`.
- Gli slug built-in hanno precedenza sulle righe `public_apps` e sono quindi riservati.
- `/a/$slug` accetta e propaga la search `lang`; Home e Vetrina la valorizzano esplicitamente.
- Le entry flagship non espongono `cover` o `fn`; usano `capability`, `proof` e una firma visiva tipizzata.

Nessun commit, push, deploy preview, deploy production, test browser completato, load test esterno, pagamento, store upload o score fittizio è stato eseguito durante la fase.
