# Audit Helix — Fase 8

Data: 2026-08-20

Stato: **contratti Prototype/Production e workspace Prototype stabilizzati localmente; la pipeline Production multi-file resta intenzionalmente disabilitata e non viene dichiarata completata**.

## Risolto

- Il livello di prodotto è ora esplicito e separato dall'azione del job. `buildLevel` accetta soltanto `prototype` o `production`; `generate`, `iterate`, `debug` e `host` continuano a descrivere l'azione richiesta e non la qualità dell'artefatto.
- I dati legacy senza livello vengono interpretati esclusivamente come `prototype`. Un valore esplicito sconosciuto viene rifiutato e non può causare un downgrade silenzioso.
- La richiesta e il fingerprint persistente includono `buildLevel`, quindi la stessa richiesta Prototype e Production non condivide la stessa chiave di idempotenza.
- La modalità Production è visibile ma disabilitata nell'interfaccia con una spiegazione esplicita. Lato server fallisce con un errore non retryable prima di quota guest, creazione job, addebito crediti o mutazione progetto. Non viene generato o addebitato un Prototype al posto della Production richiesta.
- I progetti persistono il proprio `build_level`; la coda normalizza il livello dei payload legacy e lo mantiene durante enqueue, hydrate e replay.
- Il motore corrente accetta soltanto job Prototype. Orchestratore e release candidate rifiutano esplicitamente Production con `PRODUCTION_PIPELINE_NOT_CONFIGURED` / `PRODUCTION_WORKSPACE_NOT_CONFIGURED`, invece di produrre un singolo HTML e chiamarlo applicazione completa.
- È stato introdotto un contratto Zod `helix_workspace` v1 per workspace testuali deterministici. Il manifest include metadati, livello, entrypoint, descrittori ordinati, ruolo derivato dal path, MIME type, byte UTF-8, SHA-256 per file, capability, validation scope e SHA-256 canonico dell'intero manifest.
- L'hash del workspace è indipendente dall'ordine delle chiavi nel record dei file. Una modifica a contenuto o metadati viene rilevata da `verifyWorkspace`.
- I path del workspace sono fail-closed: devono essere relativi e normalizzati NFC; sono rifiutati path assoluti, backslash, segmenti vuoti o `..`, caratteri di controllo, `%`, `:`, `.env`, `.git`, `node_modules`, nomi riservati e collisioni NFC/case-folded.
- I limiti sono applicati prima del packaging: massimo 192 file, 512 KiB UTF-8 per file e 4 MiB complessivi. `helix.workspace.json` è riservato, non compare tra i file hashati e viene aggiunto soltanto all'export verificato.
- Il validatore Production richiede tutti i ruoli di consegna, dichiarazioni capability coerenti e controlli `typecheck`, `lint`, `test`, `build` e `security` realmente eseguiti e passati. Questo contratto esiste, ma non abilita da solo la pipeline Production.
- Il release candidate Prototype include `README`, `.env.example`, PRD, architettura, decisioni, score, livello artefatto, report security/QA disponibili e `index.html`. Backend, API, database, auth, deploy e monitoring sono dichiarati `not_configured`; i controlli non eseguiti restano `not_run`.
- Il workspace viene sigillato dopo Aegis e dopo la normalizzazione dei report Twin/Echo/Swift. Il manifest e i file restano legati all'esatto candidate in attesa del Human Gate.
- Il Human Gate verifica nuovamente manifest, file, ownership, livello, job, progetto e corrispondenza tra `index.html` e HTML approvato. La manomissione di un file documentale viene rifiutata anche quando l'HTML preview non cambia.
- I sorgenti del workspace non sono inclusi nel DTO pubblico del job. L'export ZIP richiede autenticazione, ownership e approvazione del candidate; restituisce separatamente hash workspace, hash preview e hash del pacchetto ZIP.
- La pubblicazione GitHub costruisce blob, tree e commit Git dall'unico workspace approvato e usa un aggiornamento ref non forzato. Non usa più una sequenza di upload file indipendenti che potrebbe lasciare un repository parziale. Questa logica è verificata staticamente e unitariamente, non con una pubblicazione GitHub reale.
- La pagina Launch espone il download del workspace soltanto quando esistono manifest e Human Gate valido; nome file, livello e conteggio file provengono dal candidate approvato.

## File principali modificati

- `src/lib/build-level.ts`
- `src/lib/workspace.ts`
- `src/lib/agent-types.ts`
- `src/lib/server/agents.ts`
- `src/lib/server/vetra.ts`
- `src/lib/server/agents/contracts.ts`
- `src/lib/server/jobs/create.ts`
- `src/lib/server/jobs/queue.ts`
- `src/lib/server/orchestrator/helix.ts`
- `src/lib/server/release/candidate.ts`
- `src/lib/server/release/workspace.ts`
- `src/lib/server/review/human-gate.ts`
- `src/lib/server/workspace-export.ts`
- `src/lib/server/github.ts`
- `src/components/idea-desk.tsx`
- `src/routes/index.tsx`
- `src/routes/try.tsx`
- `src/routes/studio.$id.tsx`
- `src/routes/studio.$id.launch.tsx`
- `src/lib/messages.ts`
- `migrations/0016_build_level_workspace.sql`
- `scripts/build-level-mode.test.mjs`
- `scripts/workspace-artifact.test.mjs`
- `scripts/workspace-release-integrity.test.mjs`
- `scripts/build-job-worker.test.mjs`
- `scripts/human-gate.test.mjs`
- `scripts/migration-integrity.test.mjs`

## Verifiche

| Verifica                                                              | Risultato                                                                   |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Typecheck strict                                                      | PASS                                                                        |
| Test repository: `node --test 'scripts/**/*.test.mjs'`                | PASS — 202/202                                                              |
| Separazione Prototype/Production e blocco prima di quota/job/crediti  | PASS                                                                        |
| Fingerprint e persistenza di `buildLevel`                             | PASS                                                                        |
| Workspace: ordine deterministico, hash, tamper, path e limiti         | PASS                                                                        |
| Production validator fail-closed su deliverable/capability/validation | PASS                                                                        |
| Human Gate: verifica manifest e tamper di file non-HTML               | PASS                                                                        |
| Export autenticato e hash distinti workspace/preview/ZIP              | PASS                                                                        |
| GitHub tree/commit atomico dal workspace approvato                    | PASS statico/unitario — nessuna chiamata GitHub live                        |
| Migration chain completa, inclusa `0016`                              | PASS su database di test                                                    |
| Lint                                                                  | PASS — 0 errori, 5 warning non bloccanti nel file legacy `src/lib/i18n.tsx` |
| Build client + SSR Netlify con Vite                                   | PASS                                                                        |
| Smoke output Netlify                                                  | PASS                                                                        |
| Secret scan worktree                                                  | PASS — 272 file controllati, 0 finding                                      |
| Browser QA Twin/Echo/Swift del workspace                              | **NOT_RUN in questo ambiente**                                              |
| Browser E2E della UI Prototype/Production e download ZIP              | **NOT_RUN**                                                                 |

I test della policy CI erano già compresi nel totale 202/202: il conteggio non viene presentato come se la Fase 8 avesse aggiunto o rieseguito una seconda suite indipendente. Allo stesso modo, typecheck, lint, build, smoke Netlify, secret scan e migration integrity validano il repository Helix; non costituiscono compile/test/runtime del progetto generato dentro il workspace.

## Migration ed env richieste

- `migrations/0016_build_level_workspace.sql` aggiunge `projects.build_level` con default legacy `prototype`, applica il vincolo `prototype | production` e inserisce `buildLevel: prototype` nei payload `build_jobs` precedenti che ne erano privi.
- La migration è stata inclusa nella prova della catena completa e risulta applicabile sul database di test.
- Questa fase non aggiunge nuove environment variable.
- Nessuna credenziale, API key o integrazione esterna è stata inventata o inserita nel repository.

## NON RISOLTO

- **NON RISOLTO — pipeline Production multi-file:** il contratto esiste, ma non è configurato alcun orchestratore capace di generare, validare e finalizzare un workspace Production. La richiesta viene correttamente bloccata; non viene dichiarata disponibile.
- **NON RISOLTO — sandbox compile/test/runtime del progetto generato:** Helix non avvia ancora un ambiente isolato che installi dipendenze, compili sorgenti, esegua test e avvii il runtime del workspace. I gate verdi del repository Helix non sono prove del progetto generato.
- **NON RISOLTO — generazione reale di backend, API, database, auth, integrazioni e monitoring:** il Prototype continua a produrre un'app HTML interattiva e documenti. Non crea servizi deployable, route/API verificate, schema/migration applicate, sessioni e authorization, adapter esterni o observability del prodotto generato. Il manifest li etichetta `not_configured`.
- **NON RISOLTO — deploy Production multi-asset:** Harbor continua a pubblicare l'artefatto web HTML approvato. Non esiste un deploy verificato di un workspace Production composto da frontend, server, database, migration e asset multipli.
- **NON RISOLTO — storage artefatti dedicato:** file e manifest del workspace restano serializzati nel payload testuale di `build_jobs`. Non esistono object storage, versioning separato, streaming, garbage collection o retention per gli artefatti.
- **NON RISOLTO — file binari e workspace grandi:** il contratto accetta soltanto `Record<string, string>`, con limite totale di 4 MiB e 512 KiB per file. Immagini, font, archivi, binari e repository più grandi non sono supportati.
- **NON RISOLTO — browser QA reale:** Twin, Echo e Swift restano `NOT_RUN` in questo ambiente quando Playwright/Chromium o il runner remoto non sono disponibili. Non vengono dichiarati click, screenshot, accessibility o performance misurati.
- **NON RISOLTO — E2E browser della UI:** selezione del livello, stato disabilitato Production, Human Gate e download del workspace non sono stati esercitati in un browser reale.
- **NON RISOLTO — pubblicazione GitHub live:** la costruzione atomica blob/tree/commit è coperta da test e vincolata al workspace approvato, ma non è stata eseguita contro un repository GitHub reale.
- **NON RISOLTO — deploy preview/production Netlify della Fase 8:** build e smoke locali sono verdi, ma non è stato pubblicato né sondato un nuovo deploy Netlify.
- **NON RISOLTO — dipendenze dev Netlify:** resta il finding già documentato di vulnerabilità high transitivamente nella toolchain di sviluppo; l'audit production era verde nelle fasi precedenti.
- **NON RISOLTO — secret storico:** la credenziale OAuth storica deve ancora essere revocata/ruotata e rimossa dalla cronologia Git coordinata. Il worktree corrente è pulito.

## Breaking change

- `BuildJob` e i nuovi progetti espongono `buildLevel`; i consumer legacy ricevono `prototype` durante hydrate/backfill.
- Una richiesta esplicita `production` ora riceve un errore fail-closed e non viene silenziosamente trattata come Prototype.
- `projects` contiene la nuova colonna non nulla `build_level` con vincolo database.
- `PublicBuildJob` non espone più `files`; il sorgente completo è disponibile soltanto tramite l'export autenticato del candidate approvato.
- I release candidate nuovi includono un manifest workspace v1 e documenti aggiuntivi (`.env.example`, livello artefatto, score JSON ed evidence JSON).
- L'export workspace aggiunge `helix.workspace.json`; il file è riservato e non può essere fornito dall'input del generatore.

Nessun commit, push, deploy preview, deploy production, pubblicazione GitHub live, installazione/compile/runtime del workspace generato, pagamento, store upload o browser test completato è stato eseguito durante la fase.
