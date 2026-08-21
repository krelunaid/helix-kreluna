# Audit Helix — Fase 3

Data: 2026-08-20

Stato: **stabilizzata localmente; non pubblicata**.

## Risolto

- Sostituita la coda volatile in memoria con una coda persistente nel database. I job, gli attempt, gli stati, i checkpoint, i lock e gli errori sopravvivono al processo e sono condivisi tra istanze.
- Il claim usa un lock transazionale con `FOR UPDATE SKIP LOCKED`; lease, heartbeat, timeout e fencing impediscono a un worker scaduto di sovrascrivere un tentativo successivo.
- Enqueue, retry, resume e cancel sono idempotenti e persistenti. Sono presenti limite tentativi, backoff, trace errore e recupero dei lease scaduti.
- Aggiunte una Netlify Background Function autenticata per l'esecuzione e una Scheduled Function per il recupero. Il secret di dispatch non viene scritto nei log.
- Tutte le generazioni guest, utente e iterate passano dallo stesso orchestratore Helix. Il vecchio generatore diretto xAI è rimosso; l'endpoint legacy restituisce un errore tipizzato `410`.
- L'accesso xAI è centralizzato in un solo client con timeout, abort, errori tipizzati e metadati di utilizzo. In assenza di `XAI_API_KEY` il job fallisce esplicitamente e non viene marcato `done`.
- Introdotti checkpoint versionati per PRD, architettura, direzione visiva, Forge UI, Forge Logic, patch, review e artefatto finale. Il fingerprint della richiesta e la versione pipeline sono verificati contro il record autorevole nel DB.
- Un artefatto finale già validato può essere ripreso senza una seconda chiamata al modello. Un checkpoint corrotto viene rifiutato.
- `agents.ts` è ora una facciata RPC strict e non contiene `@ts-nocheck`; il motore è separato in `orchestrator`, `agents`, `jobs`, `grok`, `prompts`, `persistence`, `review`, `release` e tipi.
- Gli agenti eseguiti hanno un contratto Zod con id/versione, tipo reale, ruolo, input/output, tool consentiti, modello, timeout, retry, budget token/costo, artefatto e validazione.
- Nova produce un PRD strutturato; Atlas produce un'architettura distinta; Lumen genera esattamente tre direzioni visive e ne seleziona una con scoring deterministico.
- Forge è diviso in UI/Structure e Logic. Le Gemme applicano sostituzioni controllate su un frammento unico con hash SHA-256 del documento di partenza e validazione dell'HTML risultante; non possono restituire una riscrittura completa.
- Il release candidate salva `docs/prd.md`, `docs/prd.json`, `docs/architecture.md` e `docs/architecture.json` tra gli artefatti del job.
- La UI distingue `AI Agent`, `Validator`, `Scanner`, `Service`, `Gate` e `Rule`. Servizi non eseguiti, backend production, browser test, load test, store e packaging restano `standby`/`skipped` e non sono presentati come completati.
- Twin non dichiara click simulati, Storm non dichiara carico inventato, Senate è etichettato `Automated Council Score`, Iris dichiara la sola review statica e i mock preview devono essere etichettati come mock/demo.

## File principali modificati

- `migrations/0008_build_job_queue.sql`
- `netlify/functions/helix-job-background.mts`
- `netlify/functions/helix-queue-sweep.mts`
- `src/lib/server/jobs/queue.ts`, `worker.ts`, `recovery.ts`, `dispatch.server.ts`, `create.ts`, `submit.server.ts`, `pipeline.ts`
- `src/lib/server/orchestrator/helix.ts`
- `src/lib/server/agents.ts`, `src/lib/server/agents/contracts.ts`, `design.ts`, `html.ts`, `patch.ts`, `types.ts`
- `src/lib/server/grok/client.ts`, `src/lib/server/prompts/helix.ts`
- `src/lib/server/persistence/build-jobs.ts`
- `src/lib/server/release/candidate.ts`, `src/lib/server/review/agents.ts`
- `src/lib/agent-types.ts`, `src/components/agent-board.tsx`, `src/components/control-center.tsx`
- `.env.example`, `README.md`, `netlify.toml`
- `scripts/build-job-queue.test.mjs`, `scripts/build-job-worker.test.mjs`
- `scripts/agent-artifact-validation.test.mjs`, `scripts/agent-contracts.test.mjs`
- `scripts/gem-controlled-patch.test.mjs`, `scripts/netlify-job-functions.test.mjs`
- test di accesso, atomicità progetto e integrità migration aggiornati per i nuovi campi server-only.

## Verifiche

| Verifica | Risultato |
| --- | --- |
| Typecheck strict | PASS |
| Test repository | PASS — 114/114 |
| Test coda concorrente/lease/fencing/retry | PASS |
| Test worker: errore provider e resume checkpoint | PASS |
| Test contratti agente e tre direzioni Lumen | PASS |
| Test patch Gem controllata | PASS |
| Test Background/Scheduled Function | PASS |
| Lint | PASS — 0 errori, 9 warning non bloccanti già censiti |
| Build Netlify full-stack | PASS |
| Bundle standalone Netlify Functions | PASS — background e schedule riconosciuti |
| Ricerca `catch {}`, coda `Map`, generatore legacy e `@ts-nocheck` nel motore | PASS — nessuna occorrenza; resta solo il file generato `routeTree.gen.ts` |
| `git diff --check` | PASS |

## Migration ed env richieste

- Applicare `migrations/0008_build_job_queue.sql` dopo `0007`. La migration aggiunge stato coda, versione pipeline, fingerprint, lease, heartbeat, retry e tabella attempt.
- Configurare `HELIX_QUEUE_DISPATCH_SECRET` con un valore casuale lungo. Deve essere identico per Background Function e Scheduled Function e non deve essere esposto al client.
- In produzione restano obbligatorie `DATABASE_URL` e `XAI_API_KEY`; il fallback PGlite è solo locale e non è una coda distribuita/durevole.
- Non sono state create o inventate credenziali esterne.

## Ancora aperto

- **NON RISOLTO — Human Gate completo:** il worker si arresta realmente in `awaiting_human_approval`, ma decisioni approve/reject/modify, audit trail e ripresa deploy sono oggetto della Fase 4.
- **NON RISOLTO — deploy/store reale:** questa fase non pubblica nulla. Harbor e gli stati store saranno corretti nella Fase 4; non è stata effettuata alcuna submission.
- **NON RISOLTO — QA browser/load/security/performance:** Twin, Storm, Aegis, Echo e Swift dichiarano onestamente `skipped`/`not run`; le esecuzioni reali appartengono alla Fase 5.
- **NON RISOLTO — Score misurato/stimato:** il Council è ora etichettato come formula automatica, ma la separazione completa measured/estimated e la capacity forecast appartengono alla Fase 6.
- **NON VERIFICATO CON PROVIDER REALE:** nessuna chiave xAI è stata usata. Sono verificati contratti, failure path e resume; una generazione reale richiede `XAI_API_KEY` e uno smoke controllato.
- **NON VERIFICATO SU NEON MULTI-ISTANZA:** la concorrenza è testata contro database locale; il pre-deploy deve ripetere claim, lease e recovery sul database production-like.
- Una chiamata provider resta semantica at-least-once: se il processo muore dopo la risposta del modello ma prima del checkpoint, la chiamata può essere ripetuta. I checkpoint riducono la finestra ma non rendono il provider transazionale.
- Il bundle delle funzioni include ancora il fallback PGlite ed è più grande del necessario. Separare completamente il driver locale dal bundle serverless resta debito di performance.
- `orchestrator/helix.ts` è stato decomposto per responsabilità esterne, ma conserva ancora coordinamento esteso; ulteriori estrazioni devono avvenire solo con test di comportamento.

## Breaking change

- I job usano la pipeline `helix-v2`; checkpoint di versioni o richieste differenti vengono ignorati e ricostruiti.
- Il completamento della generazione non equivale più a deploy: lo stato persistente diventa `awaiting_human_approval`.
- L'endpoint di generazione legacy diretta è ritirato e restituisce `410`.
- In produzione il worker non parte senza `HELIX_QUEUE_DISPATCH_SECRET`, `DATABASE_URL` e configurazione provider valida.

Nessun commit, push, deploy preview o deploy production è stato eseguito durante la fase.
