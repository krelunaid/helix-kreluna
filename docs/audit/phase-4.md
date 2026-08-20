# Audit Helix — Fase 4

Data: 2026-08-20

Stato: **stabilizzata localmente; non pubblicata**.

## Risolto

- Il worker sigilla il release candidate con SHA-256 e si arresta in `awaiting_human_approval`. Il deploy non usa più l'HTML mutabile del progetto o fornito dal client.
- `approve` e `reject` sono decisioni server-side atomiche, autorizzate per ownership, idempotenti per `requestId` e registrate in un audit trail append-only con attore, timestamp, decisione e hash dell'artefatto.
- `modify` rifiuta il candidate precedente, crea un solo job figlio collegato, verifica il fingerprint sui replay e riparte dalla pipeline Helix. La transazione comprende gate, eventuale addebito, enqueue e cambio del job corrente.
- I guest usano una capability distinta per ogni iterazione, con token casuale/hash a riposo/scadenza. Audit e database non salvano mai il token raw.
- Un candidate vecchio non può essere approvato o pubblicato dopo una nuova iterazione: ogni progetto punta al solo `current_build_job_id` autorizzabile.
- Pubblicazione web, preview guest, pacchetto mobile/Windows, push GitHub e hosting richiedono tutti un job corrente, sigillato e approvato. Sono rimossi i bypass che accettavano HTML client o il solo `projectId`.
- La pubblicazione web Kreluna persiste app e deploy reali nel database, con provider, deploy ID, URL, artifact ref/hash, timestamp, release key idempotente e riferimento di rollback. Addebito, app, progetto, deploy e stato job committano insieme.
- La preview guest è temporanea, tokenizzata, rate-limited e legata al solo artefatto approvato. Il client non può sostituire titolo o HTML al momento della pubblicazione.
- La transizione `approved → deploying → deployed` è sequenziale nel database e resta parte della stessa transazione della release. Il test sul bundle ha verificato che due publish concorrenti producano una sola release e un solo addebito.
- Il vecchio `playReady || true` è rimosso. La readiness iOS/Android resta falsa finché build nativa, signing e provider store non esistono realmente.
- `shipStore` non dichiara più upload o submission: prepara soltanto un workspace Expo web-to-native in ZIP, salva `package_prepared` e restituisce `submissionStatus: not_executed`.
- Il pacchetto Windows è dichiarato web-to-desktop source package; non viene presentato come binario compilato.
- La UI mostra il gate soltanto sul candidate in attesa, persiste davvero Approve/Reject/Modify e disabilita il lancio finché il server non ha registrato l'approvazione.
- Le modifiche Lumen/Score dalla UI non alterano più localmente l'HTML dopo il seal: avviano una nuova iterazione reale, che dovrà essere nuovamente approvata.
- Twin, store e deploy usano testi veritieri: nessun click browser, CDN probe, build nativa, signing o upload viene dichiarato se non eseguito.

## File principali modificati

- `migrations/0009_human_gate_release.sql`
- `migrations/0010_linked_build_enqueue.sql`
- `migrations/0011_release_state_transition.sql`
- `src/lib/server/review/human-gate.ts`
- `src/lib/server/jobs/queue.ts`
- `src/lib/server/persistence/build-jobs.ts`
- `src/lib/server/build-job-access.ts`
- `src/lib/server/agents.ts`
- `src/lib/server/vetra.ts`
- `src/lib/server/deploy.ts`
- `src/lib/server/github.ts`
- `src/lib/expo-pack.ts`
- `src/lib/agent-types.ts`
- `src/components/human-gate.tsx`
- `src/routes/studio.$id.tsx`
- `src/routes/studio.$id.launch.tsx`
- `src/routes/try.tsx`
- `src/lib/messages.ts`
- `src/lib/score.ts`
- `scripts/human-gate.test.mjs`
- `scripts/guest-human-gate.test.mjs`
- `scripts/deploy-honesty.test.mjs`
- `scripts/migration-integrity.test.mjs`
- `scripts/phase2-output-smoke.mjs`

## Verifiche

| Verifica | Risultato |
| --- | --- |
| Typecheck strict | PASS |
| Test repository | PASS — 134/134 |
| Human Gate owner: seal, approve/reject, audit, race, ownership, stale/old candidate | PASS |
| Human Gate guest: token/hash/expiry, modify, replay/fingerprint, publish | PASS |
| Store honesty e assenza di status fake | PASS |
| Catena migration `0001–0011` e rerun | PASS |
| Lint | PASS — 0 errori, 5 warning non bloccanti nel file legacy `i18n.tsx` |
| Build client + SSR Netlify | PASS |
| Smoke output Netlify: SSR, route PWA, header, `/api/auth/*`, `createServerFn` reale | PASS |
| Smoke RPC bundle: pre-approval | PASS — `409`, 0 addebiti, 0 app, 0 deploy |
| Smoke RPC bundle: post-approval concorrente | PASS — 1 audit, 1 addebito, 1 app, 1 deploy, job `deployed` |
| Failure path xAI senza chiave | PASS — errore strutturato, job non marcato done |
| Secret scan tree corrente | PASS — 220 file tracciati |
| Ricerca `playReady || true`, secret hardcoded, status store simulati e `catch {}` | PASS |
| `git diff --check` | PASS |

La build composita è stata verificata eseguendo i suoi due passaggi effettivi: Vite full-stack e migrator. Senza `DATABASE_URL` il migrator termina correttamente in modalità locale; lo smoke PGlite applica e prova l'intera catena migration.

## Migration ed env richieste

- Applicare in ordine `0009` → `0011` dopo la migration della coda.
- `0009` aggiunge seal, candidate corrente, audit Human Gate e metadati di release.
- `0010` rende sequenziale e idempotente l'enqueue del job figlio con `parent_job_id`.
- `0011` rende sequenziale la transizione release `approved → deploying → deployed` senza dipendere dalla visibilità tra CTE PostgreSQL.
- Nessuna nuova env obbligatoria è stata introdotta per il gate.
- In produzione restano necessarie `DATABASE_URL`, le env auth e `VITE_PUBLIC_HOSTNAME` già censite nelle fasi precedenti.
- `EXPO_TOKEN`, `APPLE_TEAM_ID` e `PLAY_SERVICE_JSON` sono soltanto rilevate come configurazione potenziale: la loro presenza **non** marca build, signing o submission come pronti.
- Non sono state create, stampate o inventate credenziali esterne.

## Ancora aperto

- **NON RISOLTO — App Store/Google Play reali:** EAS/native build, signing, upload, TestFlight/track e submission ID non sono integrati. Il sistema produce soltanto un source package onesto.
- **NON RISOLTO — app mobile nativa:** il pacchetto attuale è un wrapper Expo WebView, non un'app React Native completa. Orbit resta da implementare nella fase Production.
- **NON RISOLTO — rollback operativo:** ogni release salva `rollback_ref`, ma non esiste ancora un endpoint che effettui il rollback.
- **NON RISOLTO — deploy provider esterno:** Harbor web usa realmente il public-app store Kreluna e la route dell'app, ma non è stato eseguito un deploy Netlify preview/production né un probe CDN esterno.
- **NON RISOLTO — atomicità GitHub esterna:** il gate protegge l'artefatto, ma una creazione repository seguita da un errore file può lasciare un repository parziale. Servono idempotenza/outbox e compensazione.
- **NON RISOLTO — protezione token GitHub a riposo:** il token utente è ancora conservato nel database applicativo; cifratura/secret store e rotazione appartengono all'hardening security.
- **NON RISOLTO — QA browser/load/security/performance:** Twin, Storm, Aegis, Echo e Swift restano onestamente `not run`/statici. Le esecuzioni reali appartengono alla Fase 5.
- **NON RISOLTO — store provider failure lifecycle:** non esistendo ancora il provider, non esistono retry, webhook, cancellation o payment/store failure remoti da orchestrare.
- Il checkpoint persistente distingue costruzione e review, mentre la lease di esecuzione usa `queue_status = running`; non viene mostrato un deploy prima di `approved`.
- Il build emette warning del fallback locale PGlite (`eval`) e degli import `pg` esternalizzati dal browser bundle. Non bloccano SSR, ma il driver locale va separato dal bundle production per ridurre peso e superficie.

## Breaking change

- `publishWeb`, `shipStore`, `pushProjectGithub` e i download richiedono ora un `jobId` approvato; le operazioni idempotenti richiedono anche `requestId` dove applicabile.
- `publishGuest` non accetta più HTML o titolo dal client: richiede `jobId`, capability guest e `requestId`.
- Un candidate legacy privo di `artifact_sha256` non è pubblicabile: deve essere rigenerato e approvato.
- Gli status store precedenti non sono più compatibili: il solo esito locale è `package_prepared`; submission e URL store sono `not_executed`/null.
- `shipLive` e `queueStores`, non utilizzati e non sicuri, sono stati rimossi.

Nessun commit, push, deploy preview, deploy production o store upload è stato eseguito durante la fase.
