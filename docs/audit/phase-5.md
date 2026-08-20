# Audit Helix — Fase 5

Data: 2026-08-20

Stato: **stabilizzata localmente; rilascio ancora bloccato dai riscontri nella cronologia Git e dalle verifiche esterne non eseguite**.

## Risolto

- Aegis produce un report statico misurato, versionato e legato allo SHA-256 esatto del candidato. Secret, sink DOM pericolosi, rete non autorizzata, navigazione esterna e violazioni CSP bloccanti impediscono il passaggio al Human Gate.
- La CSP dei contenuti generati è deny-by-default e offline: `connect-src`, frame, object, form e origini HTTPS restano chiusi finché una singola origine non viene esplicitamente autorizzata. I prompt non richiedono più Google Fonts o immagini Unsplash.
- I report Aegis/Twin/Echo/Swift sono persistiti per job e artefatto. Sono immutabili: update e delete diretti sono rifiutati; una cancellazione per retention richiede una transazione auditata e non consente di alterare le prove.
- Twin non usa più regex per dichiarare click. Il runner browser apre davvero l'HTML protetto, usa viewport phone/desktop, scopre e aziona controlli, compila e invia form, registra mutazioni effettive, console/runtime error, richieste bloccate e screenshot.
- In assenza di Playwright/Chromium o di un runner configurato Twin restituisce `not_run`; non viene generata alcuna prova sintetica. Lo stesso contratto vale per Echo e Swift.
- È disponibile un adapter per runner remoto con HMAC, timestamp, nonce anti-replay, timeout, limiti di payload, redirect disabilitati, binding all'hash dell'artefatto e verifica SHA/PNG degli screenshot. Il servizio di riferimento esegue il runner reale e non accetta una modalità simulata.
- Echo registra controlli browser su lingua, immagini, label, landmark, ARIA, focus e tastiera; il report distingue chiaramente esecuzione completata, fallita e non eseguita.
- Swift registra metriche browser per viewport: load, DOMContentLoaded, FCP, LCP, CLS, TBT, richieste e byte. Le metriche restano `not_run` senza esecuzione reale.
- Iris riceve l'HTML completo, brief, acceptance criteria, report Twin/Echo/Swift, screenshot e errori runtime per lo stesso hash. Una review soltanto statica o senza azioni che cambiano davvero la UI è `inconclusive`, mai `passed`.
- Storm è un CLI di load test reale e limitato. Non invia traffico senza conferma esplicita, applica limiti duri e richiede un'allowlist esatta per origini esterne.
- I wrapper Expo ed Electron usano soltanto HTML protetto. WebView/renderer, rete, persistenza, permessi, popup, download, navigazione e sessione sono fail-closed.
- Il rilascio conserva separatamente l'hash della sorgente approvata e l'hash dei byte esatti HTML/ZIP pubblicati. La lettura ricalcola l'hash dell'HTML servito e risponde con errore se l'artefatto è stato alterato.
- I PAT GitHub nuovi sono cifrati AES-256-GCM con nonce casuale, AAD legato all'utente e versione chiave. Il database rifiuta scritture plaintext legacy senza includere il token nell'errore.
- Il secret scanner controlla worktree, tutti i blob/commit raggiungibili e i messaggi di commit senza stampare valori. Il worktree corrente non contiene finding.
- Il Human Gate mostra prima dell'approvazione Aegis, Twin, Echo e Swift. Se il browser QA non è completo avvisa che runtime, accessibilità e performance non sono certificati.
- La UI non chiama più “validato” un candidato soltanto sigillato e distingue job ready, failed e cancelled. Council è presentato come score automatico, non come voto di specialisti indipendenti.

## File principali modificati

- `migrations/0012_quality_evidence.sql`
- `migrations/0013_github_token_encryption.sql`
- `migrations/0014_published_artifact_integrity.sql`
- `migrations/0015_browser_quality_evidence.sql`
- `src/lib/generated-content-policy.ts`
- `src/lib/server/quality/aegis.ts`
- `src/lib/server/quality/runner.ts`
- `src/lib/server/quality/types.ts`
- `src/lib/server/twin.ts`
- `src/lib/server/review/agents.ts`
- `src/lib/server/orchestrator/helix.ts`
- `src/lib/server/jobs/queue.ts`
- `src/lib/server/deploy.ts`
- `src/lib/server/release/integrity.ts`
- `src/lib/server/github.ts`
- `src/lib/expo-pack.ts`
- `src/components/human-gate.tsx`
- `src/components/control-center.tsx`
- `scripts/twin-browser.mjs`
- `scripts/twin-harness.mjs`
- `scripts/twin-runner-service.mjs`
- `scripts/browser-quality-runtime.mjs`
- `scripts/storm-load.mjs`
- `scripts/secret-history-scan.mjs`
- test Aegis, Twin, Iris, runner, Storm, package sandbox, Human Gate, migrazioni, secret e integrità deploy.

## Verifiche

| Verifica | Risultato |
| --- | --- |
| Typecheck strict | PASS |
| Test repository | PASS — 176/176 |
| Aegis/CSP e bypass di rete/DOM | PASS |
| Twin: schema, azioni, screenshot, sandbox, `not_run` onesto | PASS |
| Adapter runner HMAC/hash/replay/redazione | PASS |
| Iris evidence binding e risultato inconclusive/fail | PASS |
| Human Gate: prove immutabili e UI veritiera | PASS |
| Storm: conferma, limiti, allowlist e metriche reali | PASS |
| Package sandbox Expo/Electron | PASS |
| Hash sorgente/pubblicato e rilevazione alterazione | PASS |
| Lint | PASS — 0 errori, 5 warning non bloccanti nel file legacy `i18n.tsx` |
| Build client + SSR Netlify | PASS |
| Smoke output Netlify: SSR, PWA, header, `/api/auth/*`, `createServerFn` reale | PASS |
| Smoke RPC: billing, rate limit, ownership, Human Gate | PASS |
| Secret scan worktree | PASS — 246 file controllati, 0 finding |
| Secret scan cronologia | **FAIL ATTESO — 3 occorrenze storiche dello stesso secret, 0 nel worktree** |
| Dependency audit production (`--omit=dev`) | PASS — 0 vulnerabilità |
| Dependency audit completo | **NON VERDE — 10 high nella toolchain Netlify di sviluppo, nessun fix disponibile nel grafo corrente** |
| `git diff --check` | PASS |

La build è stata eseguita con Vite direttamente per evitare che il comando composito applichi migrazioni a un eventuale database remoto. Il migrator senza `DATABASE_URL` termina correttamente e gli smoke test applicano l'intera catena a PGlite.

## Migration ed env richieste

- Applicare `0012` → `0015` in ordine dopo le migration della coda e del Human Gate.
- `0012` persiste Aegis per job/hash; `0015` aggiunge i tre report browser e rende immutabili le prove qualità.
- `0013` converte la colonna PAT GitHub in un tombstone null-only, aggiunge envelope cifrato e blocca ogni vecchia scrittura plaintext.
- `0014` separa hash sorgente approvata e byte pubblicati per HTML e ZIP.
- `GITHUB_TOKEN_ENCRYPTION_KEY`: 32 byte casuali codificati base64/base64url; obbligatoria su Netlify.
- `GITHUB_TOKEN_KEY_VERSION`: identificatore stabile della chiave attiva; obbligatorio su Netlify.
- `HELIX_BROWSER_RUNNER_URL` e `HELIX_BROWSER_RUNNER_SECRET` sono una coppia opzionale. Se uno solo è presente lo startup fallisce. L'URL deve essere HTTPS, salvo loopback locale, e il secret deve avere almeno 32 caratteri.
- Playwright e Chromium devono esistere nell'ambiente isolato del runner, non nel processo Netlify principale.
- Nessuna credenziale è stata inventata, salvata nei report o stampata nei log.

## Ancora aperto

- **NON RISOLTO — esecuzione browser effettiva in questo ambiente:** Playwright/Chromium non sono installati e il runner remoto non è configurato. Twin, Echo e Swift sono quindi realmente `NOT_RUN`; la pipeline e il servizio sono implementati, ma non esiste ancora una prova browser di un build Helix reale.
- **NON RISOLTO — deploy del runner isolato:** il servizio di riferimento non è stato pubblicato né sottoposto a probe remoto. Servono runtime Chromium, HTTPS, secret condiviso, limiti infrastrutturali e monitoraggio.
- **NON RISOLTO — accessibilità completa:** Echo esegue controlli reali ma non integra ancora axe-core e non sostituisce una verifica manuale di contrasto, lettori di schermo e flussi solo tastiera.
- **NON RISOLTO — performance production:** Swift misura l'harness locale/isolato; non fornisce INP né prestazioni del deploy CDN reale.
- **NON RISOLTO — load test di produzione:** Storm funziona come CLI controllato, ma non è ancora integrato nel job, in un ambiente di carico dedicato o in una prova di saturazione. Nessun numero di capacità è stato dichiarato.
- **NON RISOLTO — SAST completo:** Aegis è uno scanner statico mirato, non una suite SAST generale. Dependency audit, matrice authz, SQL review e analisi manuale restano prove separate.
- **NON RISOLTO — dipendenze dev Netlify:** `npm audit` completo segnala 10 vulnerabilità high transitivamente in `extract-zip`, `image-size` e `sharp` attraverso la toolchain Netlify; `npm audit fix --dry-run` non offre un aggiornamento risolutivo. Le dipendenze runtime production riportano 0 vulnerabilità.
- **NON RISOLTO — secret storico:** la vecchia credenziale OAuth deve essere revocata/ruotata esternamente e la cronologia Git deve essere riscritta in modo coordinato. Non è stata allowlistata per far passare il controllo.
- **NON RISOLTO — PAT GitHub esistenti:** i PAT plaintext legacy sono stati scartati intenzionalmente. Gli utenti devono ricollegare GitHub dopo la configurazione della chiave; in seguito va eseguita una migration contract che rimuova trigger e tombstone legacy dopo il drain delle vecchie istanze.
- **NON RISOLTO — asset remoti delle demo legacy:** la nuova CSP li blocca per sicurezza. La Vetrina verrà sostituita nella Fase 7 con screenshot e asset locali/revisionati.
- **NON RISOLTO — Score/Council/Augur:** measured ed estimated non sono ancora separati nel modello dati; le formule e la capacity forecast sono oggetto della Fase 6.
- **NON VERIFICATO SU DEPLOY NETLIFY:** non è stato eseguito alcun deploy preview/production, né un probe remoto di server function, CSP o artefatto pubblico.

## Breaking change

- I contenuti generati non possono più accedere a origini HTTPS arbitrarie. Ogni integrazione di rete deve entrare in una allowlist esplicita e revisionata.
- I PAT GitHub esistenti non sono migrati in chiaro: vengono invalidati e devono essere reinseriti dopo la configurazione della chiave di cifratura.
- Le prove qualità sono append-only per job e SHA; non possono essere sostituite per trasformare un `not_run` o un fail in pass.
- Gli artefatti pubblicati distinguono source hash e served hash; righe legacy prive dell'envelope non ricevono hash inventati retroattivamente.
- Un risultato Iris statico o senza interazione browser osservata non è più `passed`.

Nessun commit, push, deploy preview, deploy production, load test esterno, store upload o revoca credenziale è stato eseguito durante la fase.
