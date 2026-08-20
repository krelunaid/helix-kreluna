# Audit Helix — Fase 9

Data: 2026-08-20

Stato: **CI, telemetria AI provider-bound e limiti cumulativi stabilizzati localmente; monitoring operativo, hosted CI e chiamate provider live restano non verificati**.

## Risolto

- È presente una workflow GitHub Actions di sola verifica su `main`, pull request e avvio manuale. Usa Node 22, permessi repository `contents: read`, checkout senza credenziali persistenti, timeout e cancellazione delle run superate.
- Il secret scan del worktree è eseguito subito dopo il setup di Node e prima di `npm ci`, quindi il codice del repository viene controllato prima di install script, typecheck e test.
- La CI esegue in ordine: secret scan, install lockfile, typecheck, lint, test, audit delle dipendenze production, build full-stack Vite/Netlify e smoke dell'output SSR/server.
- `npm run build` è ora il comando canonico e non mutativo: genera soltanto client, SSR e Function Netlify. La CI lo esegue direttamente senza poter applicare migration a database esterni.
- Preview e branch deploy Netlify usano lo stesso build puro. Solo il contesto Netlify `production` seleziona `build:netlify:production`, che compila prima e poi invoca il migrator in modalità strict; il migrator rifiuta contesti diversi da `NETLIFY=true` / `CONTEXT=production`, `DATABASE_URL` assente o URL non PostgreSQL.
- La workflow non contiene deploy Netlify, migration, commit, push, release, credenziali GitHub, secret Actions o chiamate cloud mutative.
- Tutto il traffico model-backed di Helix passa ora da `requestAgentCompletion`: Nova, Atlas, Lumen, Forge UI, Forge Logic, Gemme, Iris e Superior non possono più aggirare telemetria e budget con un client xAI parallelo.
- Il vecchio `src/lib/server/grok/client.ts` è stato eliminato. Il provider xAI è un adapter del contratto neutrale `AiCompletionProvider`; il registry seleziona esplicitamente un provider configurato e non effettua fallback automatici.
- Le risposte xAI sono lette conservativamente. Il parser conserva soltanto i campi documentati: prompt token, completion token, total token, cached prompt token, modello riportato, response ID e `usage.cost_in_usd_ticks`.
- Il costo provider usa una stringa intera JSON-safe: un USD equivale a `10^10` tick. Un numero assente, frazionario, fuori dal range sicuro o contraddittorio resta `unknown`; non viene trasformato in una stima basata su caratteri.
- Ogni contratto agente possiede sia il tetto leggibile `maxCostUsd` sia l'esatto `maxCostUsdTicks`; un test impedisce che divergano.
- Prima di inviare traffico al provider, una funzione PostgreSQL atomica e fenced dal lease del worker:
  - incrementa il conteggio chiamate;
  - incrementa i retry espliciti;
  - avvia la finestra temporale del job;
  - prenota il tetto costo della chiamata;
  - inserisce la riga telemetry `started`.
- La policy cumulativa corrente è: massimo 16 chiamate, 2 retry model-level, 10 minuti dalla prima chiamata AI e 9 USD di costo contabilizzato per job.
- Il completamento sposta atomicamente la prenotazione nel costo contabilizzato. Se xAI restituisce il costo effettivo viene usato quel valore; se il costo manca o l'esito è ignoto viene mantenuta conservativamente l'intera prenotazione.
- Una risposta che supera il tetto del proprio contratto viene comunque registrata con il costo provider effettivo, poi il job fallisce con `AI_COST_RESERVATION_EXCEEDED`; non viene nascosto né riclassificato come successo di agente.
- Le chiamate lasciate `started` da un worker precedente vengono recuperate come `unknown`, con costo conservativo e codice esplicito. Un nuovo worker non può azzerare conteggi o budget.
- La tabella `build_job_ai_calls` registra: job/attempt/logical call/retry, agente, contratto, provider, modello richiesto e riportato, response ID, hash richiesta, hash risultato, token, cache, latenza, costo tick, tipo di costo, stato ed errore.
- La tabella non contiene prompt, risposta, HTML, screenshot, API key o credential. Le righe terminali sono immutabili; una cancellazione richiede l'opt-in di retention `SET LOCAL helix.ai_telemetry_retention = 'on'`.
- Il riepilogo per job distingue token conosciuti, chiamate senza usage, costo provider effettivo, chiamate a costo ignoto, costo contabilizzato, latenza provider, elapsed e completezza dell'evidenza.
- I release candidate nuovi includono `docs/ai-usage.json` e `docs/ai-usage.md` quando esiste telemetria, senza chiamare “actual” il costo conservativo.
- Il test del gateway esercita realmente il percorso DB → reserve → adapter → settle con un transport controllato: successo, cached token, risposta oltre prenotazione, HTTP 503, costo ignoto e recovery dopo cambio worker.

Riferimento del contratto provider: [xAI Cost Tracking](https://docs.x.ai/developers/cost-tracking) e [xAI Prompt Caching Usage](https://docs.x.ai/developers/advanced-api-usage/prompt-caching/usage-and-pricing).

## File principali modificati

- `.github/workflows/ci.yml`
- `package.json`
- `netlify.toml`
- `scripts/ci-policy.test.mjs`
- `scripts/build-command-safety.test.mjs`
- `scripts/migrate.mjs`
- `src/lib/server/ai/types.ts`
- `src/lib/server/ai/provider.ts`
- `src/lib/server/ai/providers/xai.ts`
- `src/lib/server/ai/budget.ts`
- `src/lib/server/ai/telemetry.ts`
- `src/lib/server/ai/gateway.ts`
- `src/lib/server/agents/contracts.ts`
- `src/lib/server/agents/types.ts`
- `src/lib/server/orchestrator/helix.ts`
- `src/lib/server/review/agents.ts`
- `src/lib/server/release/candidate.ts`
- `src/lib/server/release/workspace.ts`
- `src/lib/agent-types.ts`
- `migrations/0017_ai_call_telemetry.sql`
- `scripts/ai-telemetry-budget.test.mjs`
- `scripts/agent-contracts.test.mjs`
- `scripts/migration-integrity.test.mjs`
- `README.md`
- `AGENTS.md`

Eliminato perché duplicato:

- `src/lib/server/grok/client.ts`

## Verifiche

| Verifica                                                         | Risultato                                                            |
| ---------------------------------------------------------------- | -------------------------------------------------------------------- |
| Typecheck strict                                                 | PASS                                                                 |
| Test repository                                                  | PASS — 215/215                                                       |
| Test AI telemetry/budget/gateway                                 | PASS — 9/9                                                           |
| Test contratti/migration/worker mirati                           | PASS                                                                 |
| Lint                                                             | PASS — 0 errori, 5 warning Fast Refresh legacy in `src/lib/i18n.tsx` |
| `npm run build` client + SSR Netlify                             | PASS                                                                 |
| Output Netlify: SSR, server function, auth, PWA e route flagship | PASS                                                                 |
| Secret scan worktree                                             | PASS — 283 file, 0 finding                                           |
| Audit dipendenze production                                      | PASS — 0 vulnerabilità                                               |
| Audit completo, incluse dev dependency                           | **FAIL — 10 high nella toolchain Netlify; vedere NON RISOLTO**       |
| CI policy                                                        | PASS — 3/3                                                           |
| Sicurezza comando build/migration                                | PASS — 4/4                                                           |
| Migration chain completa, inclusa `0017`                         | PASS su PGlite                                                       |
| `git diff --check`                                               | PASS                                                                 |
| Chiamata xAI live con billing reale                              | **NOT_RUN**                                                          |
| GitHub Actions hosted run                                        | **NON VERIFICATO**                                                   |
| Branch protection che richiede `Verify`                          | **NON VERIFICATO**                                                   |

La build conserva i warning noti: moduli Node `pg` esternalizzati nel pass client e uso di `eval` dentro PGlite. Non sono stati nascosti o promossi a prova di performance browser.

## Migration ed env richieste

- `migrations/0017_ai_call_telemetry.sql` aggiunge i contatori di budget atomici a `build_jobs`, la tabella `build_job_ai_calls`, i vincoli start→terminale, la retention esplicita e le funzioni DB di reserve, settle e recovery.
- È necessaria l'applicazione di `0017` prima di eseguire job con il nuovo gateway.
- `npm run build` non applica più migration. Fuori dal deploy production Netlify, l'operatore deve usare esplicitamente `npm run db:migrate`; il wrapper production usa `db:migrate:netlify:production` e fallisce se contesto o DB non sono validi.
- Questa fase non aggiunge environment variable.
- `XAI_API_KEY` era già obbligatoria in produzione. Se manca, il gateway fallisce prima di prenotare una chiamata perché nessun traffico o costo provider può avvenire.
- Non sono state aggiunte credenziali, pricing secret o fallback provider.

## NON RISOLTO

- **NON VERIFICATO — costo xAI live:** parser, adapter e persistenza sono testati con un transport controllato. Non è stata inviata una chiamata fatturata all'account xAI e non viene dichiarato un costo reale di produzione.
- **NON RISOLTO — garanzia assoluta pre-charge del tetto monetario:** il database impedisce prenotazioni oltre 9 USD e ogni contratto ha un tetto conservativo. Il costo provider effettivo è noto però soltanto dopo la risposta; una singola chiamata che superi la propria prenotazione può produrre un overshoot prima che Helix la registri e blocchi il job. Una garanzia finanziaria assoluta richiede anche un provider spend cap/prepaid cap o una prenotazione dimostrabilmente superiore al worst-case di input, immagini, output e tool.
- **NON RISOLTO — monitoring Warden:** non esistono ancora error tracking, uptime, latency SLO, deploy health, dependency feed o alerting esterno. Warden resta `standby` e non pubblica fix autonomi.
- **NON RISOLTO — cache applicativa persistente:** i cached token riportati da xAI vengono misurati e i prompt mantengono prefissi statici, ma Helix non conserva risposte cross-job/cross-user. I checkpoint evitano replay di fasi completate; non viene dichiarato un cache hit se xAI non lo riporta.
- **PARZIALE — multi-provider:** interfaccia, registry e selezione fail-closed sono provider-neutral, ma l'unico adapter configurato è xAI. Nessun altro provider viene selezionato automaticamente o simulato.
- **NON RISOLTO — vulnerabilità dev Netlify:** `npm audit` completo riporta 10 high transitive in `extract-zip`, `image-size` e `sharp` attraverso la toolchain Netlify corrente. `@netlify/vite-plugin-tanstack-start` è già alla versione disponibile e `npm audit fix --dry-run` non propone una correzione completa. Le dipendenze production sono a zero vulnerabilità.
- **NON VERIFICATO — CI hosted e obbligatorietà:** la workflow e i suoi test locali sono verdi, ma non è stata osservata una run GitHub Actions né configurato/verificato un ruleset che renda `Verify` obbligatorio su `main`.
- **NON RISOLTO — supply-chain hardening CI:** `actions/checkout@v4` e `actions/setup-node@v4` non sono pin SHA; `npm ci` esegue gli install script lockfile-pinned; `npm audit` dipende dalla disponibilità read-only del registry. La cache npm del runner non è un deploy, ma usa il servizio cache GitHub.
- **NON RISOLTO — policy CI semantica:** `ci-policy.test.mjs` usa controlli testuali e non un parser YAML con allowlist dei composite action. Impedisce le regressioni attuali, non dimostra matematicamente l'assenza di una futura action mutativa.
- **NON RISOLTO — secret storico:** la credenziale OAuth precedente deve ancora essere revocata/ruotata esternamente e rimossa dalla history Git con una procedura coordinata. La CI scansiona il worktree corrente; non finge che la history sia pulita.
- **NON VERIFICATO SU DEPLOY NETLIFY:** la build full-stack e lo smoke locale passano; nessun nuovo deploy preview o production è stato pubblicato o sondato.
- **NON RISOLTO — atomicità migration/pubblicazione Netlify:** il build avviene prima della migration e una migration fallita impedisce la pubblicazione, ma migration DB e publish Netlify non sono una singola transazione. Le migration production devono quindi restare expand/contract e compatibili con la release precedente.

## Breaking change

- I consumer interni non possono più invocare `requestGrokCompletion`; devono usare il gateway con job, contratto, agente e logical call key.
- `AgentContract` espone `maxCostUsdTicks` e lo strumento consentito si chiama `requestAiCompletion`.
- `BuildJob`/`PublicBuildJob` possono includere il riepilogo `aiUsage`; non includono prompt, risposta o reservation interne.
- `build_jobs` e il database richiedono la migration `0017` prima dei job AI.
- `npm run build` non migra più il database. Gli ambienti non-production richiedono una migration manuale esplicita; Netlify production usa il nuovo wrapper strict configurato in `netlify.toml`.
- Un job può ora fallire non-retryable per budget chiamate, retry, durata, costo o per superamento del tetto effettivo della singola chiamata.

Nessun commit, push, deploy preview, deploy production, migration su database esterno, chiamata xAI fatturata, pagamento, store upload, browser test o load test esterno è stato eseguito durante la fase.
