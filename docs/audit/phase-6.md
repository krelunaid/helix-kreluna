# Audit Helix — Fase 6

Data: 2026-08-20

Stato: **stabilizzata localmente; score e forecast restano limitati alle prove realmente disponibili**.

## Risolto

- Kreluna Score usa un contratto versionato `2.0.0` e la formula `kreluna-score-v2`. Ogni report è legato allo SHA-256 esatto del release candidate e conserva versione, timestamp e provenienza.
- Ogni dimensione dichiara separatamente `measured`, `estimated` o `not_run`, con valore nullable, confidence, sorgente e limitazioni. Una verifica non eseguita non vale più zero e non riceve una barra di avanzamento fittizia.
- Il readiness aggregato è dichiarato **estimated**. Il report mostra il peso delle prove misurate, stimate e mancanti; le dimensioni `not_run` non vengono trattate come failure, ma riducono confidence e completezza.
- Security, browser runtime, accessibility e performance accettano soltanto report Aegis/Twin/Echo/Swift strutturalmente validi e riferiti allo stesso hash. Prove stale o malformate non possono aumentare lo score.
- Twin/reliability e coverage senza esecuzione browser restano `status: not_run`, `value: null`. Il sistema non dichiara click, copertura o affidabilità runtime inesistenti.
- Il Council è ora un `Automated Council Score`: espone segnali derivati dalla formula e non li presenta come voti indipendenti di specialisti AI. Sono rimossi suggerimenti automatici di ship, store o Warden.
- Augur è rappresentato come **capacity forecast**. Senza load test, dati database, profilo architetturale e costi reali restituisce `not_run`, range nullo, confidence zero e l'elenco delle prove mancanti.
- Il costo mostrato dallo score è un scenario infrastrutturale stimato, con assunzioni esplicite; non viene presentato come costo operativo misurato.
- La ScoreCard separa visivamente prove misurate, stimate e non eseguite, mostra confidence/evidence mix e rende visibili i limiti di Council, Capacity e costo.
- La pagina Launch usa soltanto lo score persistito del candidate sigillato. Non ricalcola più un secondo score statico lato route; i candidate legacy devono essere rigenerati per ottenere il contratto v2 autorevole.
- I documenti di release riportano hash, versione formula, evidence split, confidence, limitazioni, scenario costi, natura automatica del Council e stato Capacity.
- La coda valida e normalizza lo score persistito contro l'hash sigillato. Uno score v2 alterato o incoerente viene rifiutato; il fallback legacy è chiaramente a bassa confidence e disponibile solo per job già sigillati.
- Il vecchio endpoint score non può avviare un browser runner o consumare AI anonimamente. Il percorso pubblico rimasto è limitato a HTML piccoli e Aegis locale; `liftScore` richiede autenticazione. Poiché nessuna route lo usa, il bundler non lo pubblica nel manifest attuale.
- Lo smoke Netlify usa una server function realmente presente e senza effetti collaterali: il generatore one-shot ritirato restituisce il `410` server-side previsto e una richiesta cross-origin riceve `403`.

## File principali modificati

- `src/lib/score.ts`
- `src/components/score-card.tsx`
- `src/lib/messages.ts`
- `src/lib/server/orchestrator/helix.ts`
- `src/lib/server/release/candidate.ts`
- `src/lib/server/jobs/queue.ts`
- `src/lib/server/score-fn.ts`
- `src/routes/studio.$id.launch.tsx`
- `scripts/kreluna-score-evidence.test.mjs`
- `scripts/build-job-worker.test.mjs`
- `scripts/twin-browser.test.mjs`
- `scripts/netlify-output-smoke.mjs`

## Verifiche

| Verifica | Risultato |
| --- | --- |
| Typecheck strict | PASS |
| Test repository | PASS — 181/181 |
| Score v2: evidence split, valori null, confidence e hash binding | PASS |
| Rejection di score/evidence stale o malformati | PASS |
| Consumer Launch, queue, worker e release docs | PASS |
| Council formula, assenza di voti AI simulati | PASS |
| Capacity forecast fail-closed senza benchmark | PASS |
| Lint | PASS — 0 errori, 5 warning non bloccanti nel file legacy `i18n.tsx` |
| Build client + SSR Netlify | PASS |
| Smoke output Netlify: SSR, PWA, header, `/api/auth/*`, `createServerFn` reale | PASS |
| Smoke RPC: billing, rate limit, ownership, Human Gate e failure xAI | PASS |
| Secret scan worktree | PASS — 248 file controllati, 0 finding |
| Secret scan cronologia | **FAIL ATTESO — 3 occorrenze storiche dello stesso secret, 0 nel worktree** |
| Dependency audit production (`--omit=dev`) | PASS — 0 vulnerabilità |
| Dependency audit completo | **NON VERDE — 10 high nella toolchain Netlify di sviluppo** |
| Migrator senza `DATABASE_URL` | PASS — skip esplicito; le migration sono provate su PGlite dai test |
| `git diff --check` | PASS |

La build è stata eseguita con Vite direttamente per non applicare migration a un database remoto eventualmente configurato. I log di failure xAI osservati negli smoke sono il risultato atteso del test fail-closed senza `XAI_API_KEY`: il job termina con errore strutturato e non viene marcato completato.

La build conserva warning noti del fallback PGlite (`eval`) e degli import `pg` esternalizzati dal bundle browser. Non bloccano l'output Netlify SSR, ma restano debito tecnico da rimuovere nella separazione production del database.

## Migration ed env richieste

- Questa fase non aggiunge migration database.
- Questa fase non aggiunge env obbligatorie.
- Le prove browser reali continuano a richiedere la coppia `HELIX_BROWSER_RUNNER_URL` / `HELIX_BROWSER_RUNNER_SECRET` e un runner isolato con Playwright/Chromium.
- Un capacity forecast eseguibile richiederà dati persistiti di load test, database/concurrency, architettura e costi; nessun valore di esempio viene usato come fallback.
- Nessuna credenziale è stata inventata, inserita nel repository o stampata nei log.

## Ancora aperto

- **NON RISOLTO — benchmark di capacità:** non è stato eseguito alcun load test di un deploy Helix, quindi Capacity/Augur resta correttamente `NOT_RUN` e non dichiara utenti supportati, throughput o saturazione.
- **NON RISOLTO — AI Council indipendente:** non vengono eseguite valutazioni separate di specialisti AI. L'attuale Council è esplicitamente una formula automatica e non simula cinque voti.
- **NON RISOLTO — costi AI misurati:** lo score mostra soltanto uno scenario infrastrutturale stimato. Token, latenza e costo per chiamata/job saranno introdotti nella Fase 9.
- **NON RISOLTO — browser QA del candidate reale:** in questo ambiente non sono configurati Playwright/Chromium o runner remoto; Twin, Echo e Swift restano `NOT_RUN`, quindi reliability, coverage e relative confidence non possono essere certificate.
- **NON RISOLTO — score production calibrato:** pesi e soglie v2 sono trasparenti e testati, ma non sono ancora calibrati contro una serie storica di incidenti, benchmark e risultati utenti.
- **NON RISOLTO — localizzazione completa delle nuove etichette:** italiano e inglese sono aggiornati; le altre locale ereditano temporaneamente il fallback inglese per le nuove chiavi.
- **NON RISOLTO — dipendenze dev Netlify:** `npm audit` completo segnala 10 vulnerabilità high transitivamente in `extract-zip`, `image-size` e `sharp`; la produzione (`--omit=dev`) riporta zero vulnerabilità. `image-size` non ha un fix disponibile nel grafo corrente.
- **NON RISOLTO — secret storico:** la vecchia credenziale OAuth deve essere revocata/ruotata esternamente e la cronologia Git deve essere riscritta in modo coordinato. Il controllo resta volutamente rosso.
- **NON VERIFICATO SU DEPLOY NETLIFY:** non è stato pubblicato un deploy preview/production e non è stato eseguito un probe remoto dello score o del runner.

## Breaking change

- I consumer dello score devono gestire `schemaVersion: 2.0.0`, `value: null` per le dimensioni non eseguite e il nuovo evidence split.
- Il Council v2 espone segnali di una formula automatica, non voti o verdetti attribuiti a specialisti.
- Il capacity forecast può essere soltanto `not_run` finché non esistono le prove minime; range e throughput sono nullable.
- Launch non costruisce più uno score parallelo: un candidate legacy deve essere rigenerato e sigillato per ottenere uno score v2 autorevole.

Nessun commit, push, deploy preview, deploy production, browser test remoto, load test esterno, store upload o revoca credenziale è stato eseguito durante la fase.
