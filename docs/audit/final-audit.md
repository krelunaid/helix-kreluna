# Audit finale Helix / Kreluna

Data: 2026-08-21

Ramo di lavoro: `fix/helix-audit-20260820`

Deploy Preview verificato: `bc5d7263623d3a58f7388e28afc90937406301d4`

## Nota di stato successiva — 2026-08-21

Questa nota registra lo stato successivo senza modificare il perimetro o le
conclusioni dell'audit storico riportato sotto.

- Il sito nel contesto **Netlify Production** è online su
  https://helix.kreluna.it dalla base `7266658`. Terra tramite Netlify AI Gateway
  e l'accesso Google sono attivi in quel deploy; Stripe resta disattivato.
- “Netlify Production” indica il deploy pubblico del sito. Il livello
  applicativo Helix denominato **Production** resta una capacità separata e
  fail-closed secondo le guardie descritte nell'audit.
- Il nuovo diff è ancora **locale e non deployato**. Porta il catalogo a **15
  showcase**, esattamente **9 app/software e 6 siti**, mostra 6 progetti in
  homepage e organizza tutti i 15 nella Vetrina con filtri e categorie.
- La route privata `/ops` è implementata senza link nella navigazione pubblica
  e con autorizzazione server-side basata su ID utente immutabile ed email
  verificata. La relativa coppia amministratore è configurata come segreto nel
  solo contesto Netlify Production; la route resta non disponibile online finché
  questo diff non viene deployato.
- La prova statica locale copre **90 artefatti** (15 showcase × 6 lingue). Il
  collaudo browser locale completo ha esercitato 16 controlli per ciascuna delle
  15 demo, con zero errori runtime/console e zero richieste esterne.
- Il fix Nova locale porta il contratto a `3.1.0`, il tetto output da 1.200 a
  2.400 token e impone una risposta sotto 1.800 token. Costo massimo, assenza di
  retry e rifiuto delle risposte troncate restano invariati; nessuna nuova
  chiamata Terra reale viene attribuita al fix.
- Sul contenuto corrente la suite completa è verde **471/471**; TypeScript,
  lint, build client+SSR e smoke Netlify sono verdi.

Il resto del documento conserva integralmente le evidenze del Deploy Preview
`bc5d7263623d3a58f7388e28afc90937406301d4`, inclusi i conteggi e le prove sulle
sei flagship allora presenti. Non costituisce prova del nuovo diff locale né
del suo deploy.

## Verdetto

**Il Deploy Preview privato dell'esatto commit `bc5d7263623d3a58f7388e28afc90937406301d4` è `ready`, usa il database preview isolato con migrazioni `0001`–`0026` ed è stato verificato con login reale. Una sola generazione Prototype/Auto da 8 crediti è arrivata senza retry al Human Gate: progetto `8c92dafe-cfc7-41d5-874e-903fd6bde2b4`, job `8277afe0-b5de-4798-9a79-0646797f45fb`, stato `awaiting_human_approval`, stage `human_gate`, checkpoint `finalized` e artefatto SHA-256 `0a5aa8aabcaf32406a2e613e04d7f401bea630092cc43e6597892f2102782d6c`. Tutte le 8 chiamate AI registrate sono `succeeded`, con provider `openai` e modello richiesto/riportato `gpt-5.6-terra`; la UI generata “Test Terra”, il testo “Terra è attivo” e il pulsante “OK” sono stati verificati come FATTO/Confermato. Il saldo finale è 42, con un solo addebito di 8 crediti per questo progetto. Nessuna approvazione o pubblicazione è stata eseguita; Production e Stripe restano disattivati.**

- Requisiti 1–62: **38 RISOLTO_LOCALMENTE / 3 VERIFICATO_ESTERNO / 21 PARZIALE_ESTERNO / 0 MANCANTE**.
- Definition of Done: **16 RISOLTO_LOCALMENTE / 3 VERIFICATO_ESTERNO / 1 PARZIALE_ESTERNO / 0 MANCANTE**.
- P0/P1 locali aperti: **0**.
- P1 operativo esterno: **1**, limitato a una credenziale OAuth preview ancora presente nella storia Git raggiungibile.

`RISOLTO_LOCALMENTE` significa che il comportamento è implementato e coperto da prove locali pertinenti. Non implica un deploy, un pagamento, una chiamata AI, un browser runner, un database gestito o una submission Store reali. `VERIFICATO_ESTERNO` significa che la specifica prova indicata è stata osservata sul Deploy Preview privato dell'esatto commit `bc5d7263623d3a58f7388e28afc90937406301d4`; non equivale a una verifica Production né estende la prova a servizi non esercitati. `PARZIALE_ESTERNO` significa che il percorso locale è implementato e fail-closed, ma l'accettazione completa richiede credenziali, infrastruttura o ulteriori prove esterne non autorizzate/disponibili. `MANCANTE` significa che manca ancora la capacità locale centrale.

## Confine delle prove

- Nessun servizio esterno è stato simulato come prova di produzione.
- È stata eseguita una sola generazione reale Prototype/Auto sull'esatto commit `bc5d7263623d3a58f7388e28afc90937406301d4`: 8/8 chiamate `succeeded`, provider `openai`, modello richiesto e riportato `gpt-5.6-terra`, zero retry e un artefatto finalizzato al Human Gate. La telemetria riporta `costKind` sconosciuto, quindi questo audit non attribuisce né stima un costo provider. Non sono state eseguite transazioni Stripe, EAS build, signing o submission Store.
- Il Deploy Preview privato usa un branch Netlify Database isolato con migrazioni `0001`–`0026`; login del tester e applicazione della migrazione `0026` sono stati verificati in quel contesto.
- Un precedente tentativo, antecedente a questo fix, era terminato con `BUILD_JOB_ENQUEUE_FAILED` prima del job e del provider ed era stato rimborsato in modo idempotente. Per il nuovo progetto completato è presente un solo addebito di 8 crediti, senza retry o doppio job; il saldo tester è 42. Il grant iniziale e l'accredito preview aggiuntivo restano crediti gratuiti di test, non pagamenti o top-up Stripe.
- La creazione progetto/enqueue atomica della migrazione `0026` e il dispatch/recovery compatibile con la protezione SSO sono committati, passati dai gate hosted e verificati sul Deploy Preview privato. Stripe e Production restano spenti.
- Non sono stati eseguiti merge o force push, né cancellati rami o file.
- Il runner Production, Twin, Warden, Nimbus, Augur e Store falliscono chiusi quando mancano adapter, evidence o credenziali reali.
- La QA Chrome descritta sotto è una verifica manuale della build locale compilata; non è un report Twin remoto firmato.

## Gate finali locali

Ambiente locale: Node `22.23.2`, npm `10.9.8`. L'installazione esistente è stata verificata; `npm ci` resta il gate della CI GitHub-hosted.

| Gate | Esito |
| --- | --- |
| TypeScript strict | PASS |
| ESLint completo | PASS, 0 errori; 5 warning legacy `react-refresh` in `src/lib/i18n.tsx` |
| Suite completa | PASS, **451/451** |
| Build client/SSR | PASS |
| Smoke output Netlify | PASS |
| Secret scan worktree | PASS, 0 finding |
| `npm audit --omit=dev` | PASS, 0 vulnerabilità runtime |
| `git diff --check` | PASS |
| Audit npm completo | FAIL: 10 advisory `high`, tutte transitive nella toolchain dev Netlify; npm riporta “No fix available” |
| Secret scan storia | FAIL atteso: 3 finding della stessa credenziale OAuth preview in commit raggiungibili |

Le advisory dev provengono da `extract-zip`, `image-size` e `sharp` tramite pacchetti di sviluppo Netlify. Non sono state nascoste né classificate come vulnerabilità runtime.

## QA Chrome della build compilata

La preview locale compilata è stata aperta in Chrome su `/vetrina` e sulle sei route flagship. Per ogni app sono state esercitate almeno cinque interazioni con verifica del nuovo stato:

| Flagship | Interazioni verificate |
| --- | --- |
| Orbit Command | selezione Vega-2, livello detriti, zoom, pianificazione accensione, conferma manovra |
| Neura | regione tronco encefalico, vista segnali, simulazione, snapshot, nota |
| Synapse | documento, ricerca, nuovo nodo, allineamento, collegamento/filtro decisioni |
| Vanta | simbolo, periodo 1W, profondità, lato vendita, quantità e ordine paper |
| Arc City | livello qualità aria, quartiere Porto, zoom, ispezione, scenario serale |
| Morph | assetto strada, materiale perla, ruota Track 22, interni inchiostro, luci |

Risultato: cambi di stato visibili e coerenti, **0 errori e 0 warning console** osservati. A viewport `390×844` la vetrina mostrava menu mobile e tutte le sei flagship; Morph misurava `390/390` sia nel documento esterno sia nell'app incorporata, senza overflow orizzontale. Il viewport è stato ripristinato al termine.

## QA reale del Deploy Preview

- Deploy privato `ready` sull'esatto commit `bc5d7263623d3a58f7388e28afc90937406301d4`, protetto da Netlify Team Login.
- Database preview isolato e attestato, con migrazioni `0001`–`0026`; presenza della funzione atomica introdotta da `0026` verificata e tester pre-provisionato senza signup pubblico.
- Login password riuscito in Chrome.
- Dopo nuova conferma esplicita, un solo Generate Prototype/Auto è stato avviato con prompt minimale; nessun retry è stato eseguito.
- Progetto `8c92dafe-cfc7-41d5-874e-903fd6bde2b4`; job `8277afe0-b5de-4798-9a79-0646797f45fb` in `awaiting_human_approval`, stage `human_gate`, checkpoint `finalized`.
- Artefatto persistito con SHA-256 `0a5aa8aabcaf32406a2e613e04d7f401bea630092cc43e6597892f2102782d6c`.
- Telemetria: 8 chiamate su 8 `succeeded`, provider `openai`, modello richiesto e riportato `gpt-5.6-terra`; `costKind` è sconosciuto e nessun costo provider viene quindi dichiarato. Questa prova non attesta esecuzioni remote Twin, Echo o Swift.
- Crediti: un solo addebito di 8 crediti per il nuovo progetto, nessun doppio addebito e saldo finale 42. Il precedente tentativo pre-provider resta interamente rimborsato.
- UI generata verificata in Chrome: titolo “Test Terra”, testo “Terra è attivo” e pulsante “OK”; esito mostrato come FATTO/Confermato.
- Il job è stato lasciato al Human Gate: nessuna approvazione, pubblicazione o attivazione Production; Stripe resta disattivato.

## Matrice requisiti 1–62

| # | Stato | Evidenza locale o limite residuo |
| ---: | --- | --- |
| 1 | VERIFICATO_ESTERNO | Il Deploy Preview privato dell'esatto commit `bc5d726` è `ready`, serve frontend e funzioni server, usa il DB isolato migrato fino a `0026`, consente il login e ha completato una generazione Prototype/Auto fino al Human Gate. |
| 2 | RISOLTO_LOCALMENTE | Inventario env, gruppi all-or-none e startup fail-closed. Nei runtime hosted è obbligatorio `DATABASE_URL` oppure la connessione SDK `NETLIFY_DB_URL`; nei runtime Netlify l'SDK è l'autorità unica per app e Better Auth e non esiste fallback PGLite. Il build preview ordinario resta non mutativo: un percorso migration richiede attestazione dell'esatto branch DB e dell'hash dell'URL autorevole. |
| 3 | PARZIALE_ESTERNO | Worktree senza secret e scanner history-aware; revoca/rotazione provider e bonifica storia non eseguite. |
| 4 | PARZIALE_ESTERNO | Checkout hosted, webhook raw-body verificato, inbox, ledger, subscription/top-up e Portal mode-aware implementati; nessun flusso Stripe Test Mode reale. |
| 5 | RISOLTO_LOCALMENTE | Crediti atomici/idempotenti, saldo non negativo, ledger coerente e test concorrenti. Il grant gratuito preview è manuale, singleton da 10 crediti, vincolato a un solo user ID/email pre-provisionato e privo di endpoint o signup. |
| 6 | RISOLTO_LOCALMENTE | Ownership utente e capability guest con token casuale, hash, scope ed expiry. |
| 7 | RISOLTO_LOCALMENTE | Rate, quota, costo, byte e concorrenza guest persistenti. |
| 8 | PARZIALE_ESTERNO | Pubblicazione guest temporanea, tokenizzata e limitata; scheduler/hosting live non verificati. |
| 9 | RISOLTO_LOCALMENTE | CSP e allowlist rete deny-by-default, sandbox e test di bypass. |
| 10 | RISOLTO_LOCALMENTE | Human Gate persistente, auditabile e hash/version-fenced per Prototype e Production. |
| 11 | RISOLTO_LOCALMENTE | Tutte le generazioni passano dall'orchestratore; generatore legacy ritirato. |
| 12 | RISOLTO_LOCALMENTE | Moduli separati, boundary testati e nessun `@ts-nocheck` nel motore. |
| 13 | RISOLTO_LOCALMENTE | Queue DB-backed con lease, heartbeat, retry, timeout, cancel, resume e fencing v2→v3. |
| 14 | RISOLTO_LOCALMENTE | Errori persistiti e strutturati; nessun `catch {}` applicativo che trasformi failure in successo. |
| 15 | RISOLTO_LOCALMENTE | Contratti agenti versionati, Zod, tool allowlist, timeout, retry, budget, artifact hash e validation. |
| 16 | RISOLTO_LOCALMENTE | Tipi/UI distinguono AI Agent, validator, scanner, service, gate e rule. |
| 17 | VERIFICATO_ESTERNO | Il Supervisor ha completato una generazione Prototype/Auto reale con zero retry, 8/8 chiamate Terra riuscite, artefatto finalizzato e arresto corretto al Human Gate. |
| 18 | PARZIALE_ESTERNO | Nova produce PRD JSON/Markdown strutturato. La prova corrente verifica il percorso provider e l'artefatto complessivo, ma non isola come evidenza autonoma l'output Nova. |
| 19 | PARZIALE_ESTERNO | Atlas produce architettura, data flow, route/API/DB/auth/integration. La prova corrente verifica il percorso provider e l'artefatto complessivo, ma non isola come evidenza autonoma l'output Atlas. |
| 20 | PARZIALE_ESTERNO | Lumen produce tre direzioni distinte e scoring. La prova corrente verifica il percorso provider e l'artefatto complessivo, ma non isola come evidenza autonoma l'output Lumen. |
| 21 | PARZIALE_ESTERNO | Forge UI, Logic e Integration sono separati e generano binding/client. La prova corrente verifica il percorso provider e l'artefatto complessivo, ma non isola come evidenza autonoma i tre output Forge. |
| 22 | RISOLTO_LOCALMENTE | Gem applica patch target/hash-bound e validation deterministica prima della persistenza. |
| 23 | RISOLTO_LOCALMENTE | Prism genera schema, migration, FK, indici, ownership e test di contratto. |
| 24 | PARZIALE_ESTERNO | Quartz genera review/rollback/backup strategy; EXPLAIN, apply e restore su DB reale restano `not_run`. |
| 25 | RISOLTO_LOCALMENTE | Vault/Basalt generano route, schema, authz, error mapping, rate limit, idempotenza e test. |
| 26 | PARZIALE_ESTERNO | Nexus genera adapter, OAuth/webhook sicuri, retry ed error mapping; connessione provider reale assente. |
| 27 | PARZIALE_ESTERNO | Key genera session/authz/recovery library e mantiene l'issuer non configurato finché manca un provider reale. |
| 28 | RISOLTO_LOCALMENTE | Orbit/Cedar dichiarano onestamente wrapper/source package, non binari nativi completi. |
| 29 | PARZIALE_ESTERNO | Twin ha browser runner, azioni, screenshot, rete negata e replay DB; runner remoto firmato non eseguito. |
| 30 | RISOLTO_LOCALMENTE | Storm esegue traffico HTTP solo con conferma e misura progressione fino a saturazione. |
| 31 | PARZIALE_ESTERNO | Aegis esegue scan secret/dependency/DOM/XSS/CSP/authz/SQL; nessun SAST esterno e restano advisory dev Netlify. |
| 32 | PARZIALE_ESTERNO | Echo controlla label, contrasto, ARIA, landmark, tastiera e focus; manca il runner browser remoto/full axe. |
| 33 | PARZIALE_ESTERNO | Swift misura LCP/CLS/TBT/load/risorse; manca una misura su deploy live e INP. |
| 34 | PARZIALE_ESTERNO | Iris consuma criteri, Twin/Echo/Swift, errori e screenshot. Il percorso modello Terra è stato esercitato nel Prototype, ma questa prova non attesta i runner remoti Twin/Echo/Swift né un report Iris completo basato su tali evidence. |
| 35 | RISOLTO_LOCALMENTE | Score separa measured, estimated e unavailable con confidence/source/hash. |
| 36 | RISOLTO_LOCALMENTE | Council formulaico è etichettato onestamente `Automated Council Score`. |
| 37 | PARZIALE_ESTERNO | Augur ha source HMAC, freshness, nonce, claim/cooldown pre-I/O, binding deploy e persistenza append-only; nessun bundle provider reale. |
| 38 | RISOLTO_LOCALMENTE | Catalogo primario esattamente di sei flagship; precedenti esperimenti archiviati. |
| 39 | RISOLTO_LOCALMENTE | Card basate sulle app reali e nessuna cover stock nelle flagship. |
| 40 | RISOLTO_LOCALMENTE | Sei app con sei signature visive distinte. |
| 41 | RISOLTO_LOCALMENTE | Font, shell, navigazione, geometry, density, palette e motion differenziati. |
| 42 | RISOLTO_LOCALMENTE | Test sui 36 artefatti localizzati bloccano shell ripetute, cliché e asset stock. |
| 43 | RISOLTO_LOCALMENTE | Chrome ha esercitato almeno cinque comportamenti in ognuna delle sei flagship con stato verificato e console pulita. |
| 44 | RISOLTO_LOCALMENTE | Prompt, capability ed evidence mostrati; score/tempo/agenti assenti senza prove. |
| 45 | RISOLTO_LOCALMENTE | Home usa Morph, Vanta e Orbit Command. |
| 46 | RISOLTO_LOCALMENTE | Tutte le sei flagship supportano sei lingue e `html lang` coerente. |
| 47 | RISOLTO_LOCALMENTE | Production genera workspace multi-file; Prototype può restare single-file. |
| 48 | RISOLTO_LOCALMENTE | Livelli Prototype/Production espliciti e nessun downgrade silenzioso. |
| 49 | RISOLTO_LOCALMENTE | Workspace include README, PRD, architecture, source, env, migration, test, config, decisions e score. |
| 50 | PARZIALE_ESTERNO | Runner valida install/typecheck/lint/test/build/security con report firmato; sandbox provider reale non configurata. |
| 51 | PARZIALE_ESTERNO | Harbor prepara il workspace multi-file con provenance, riserva/rimborsa crediti atomicamente, accetta/attiva/riconcilia/riprende in modo idempotente, persiste report HMAC e rollback e recupera riserve scadute con sweeper autenticato. Mancano runner/provider e deploy/rollback reali; il pacchetto è limitato a 4 MiB e `published_sha256` resta nullo senza digest provider firmato. |
| 52 | RISOLTO_LOCALMENTE | Store usa descriptor e provenance esatti, demota claim storici non supportati e raggiunge `distributed` solo con evidence provider firmata; nessuna UI dichiara upload inesistenti. |
| 53 | RISOLTO_LOCALMENTE | Android readiness non è hardcoded e richiede configurazione/signing/evidence. |
| 54 | PARZIALE_ESTERNO | Pipeline EAS firmata, persistente e idempotente `store-release:v2`, con riuso immutabile v1, ZIP bounded, shape EAS documentate e package Production `static_site` hash/workspace/manifest-bound dichiarato wrapper non nativo. iOS richiede build/submission ID reali; Android resta `action_required` senza un vero Google Play release ID. Nessun EAS/Apple/Google live è stato eseguito. |
| 55 | RISOLTO_LOCALMENTE | Telemetria per chiamata/job distingue provider da application cache. |
| 56 | RISOLTO_LOCALMENTE | Limiti di costo/call/retry/durata con reserve/settle atomici. |
| 57 | RISOLTO_LOCALMENTE | Response cache persistente tenant/provider/model/contract-bound, validata prima del riuso. |
| 58 | RISOLTO_LOCALMENTE | Registry provider esplicito e nessun fallback automatico. |
| 59 | VERIFICATO_ESTERNO | CI e CodeQL GitHub-hosted sono verdi sull'esatto commit preview `bc5d7263623d3a58f7388e28afc90937406301d4`, che include la migrazione `0026` e il recovery SSO. |
| 60 | RISOLTO_LOCALMENTE | Suite locale copre accesso, guest, crediti, billing, queue, gate, provider failure, score, deploy/store e locale. |
| 61 | PARZIALE_ESTERNO | Warden ha source autenticata, freshness, dedupe, persistenza e policy senza autopublish; monitoring reale assente. |
| 62 | PARZIALE_ESTERNO | Nimbus decide runtime/DB/storage/CDN/costi da evidence verificata e resta fail-closed; provisioning/provider live assenti. |

## Definition of Done

| # | Stato | Valutazione |
| ---: | --- | --- |
| 1 | VERIFICATO_ESTERNO | Frontend, funzioni server, DB isolato migrato fino a `0026`, login e una generazione Terra completa fino al Human Gate sono stati provati sul Deploy Preview privato dell'esatto commit `bc5d726`. |
| 2 | PARZIALE_ESTERNO | Worktree senza secret; la storia contiene ancora la credenziale OAuth preview. |
| 3 | RISOLTO_LOCALMENTE | Nessun piano/top-up accredita senza evento di pagamento server-side verificato. |
| 4 | RISOLTO_LOCALMENTE | Crediti atomici e idempotenti; il grant preview non è pubblico ed è un'operazione manuale singleton da 10 crediti. |
| 5 | RISOLTO_LOCALMENTE | Ownership job e capability guest protette. |
| 6 | RISOLTO_LOCALMENTE | Limiti guest persistenti. |
| 7 | RISOLTO_LOCALMENTE | Human Gate arresta realmente publish/deploy fino ad approvazione. |
| 8 | RISOLTO_LOCALMENTE | Twin esegue browser reale solo se configurato, altrimenti riporta `not_run`. |
| 9 | RISOLTO_LOCALMENTE | Score distingue misurato/stimato/non disponibile. |
| 10 | RISOLTO_LOCALMENTE | Store non dichiara upload senza evidence. |
| 11 | RISOLTO_LOCALMENTE | Readiness Android non hardcoded. |
| 12 | RISOLTO_LOCALMENTE | Motore strict senza `@ts-nocheck`. |
| 13 | RISOLTO_LOCALMENTE | Queue persistente DB-backed. |
| 14 | VERIFICATO_ESTERNO | Il job live non è avanzato oltre il Human Gate senza approvazione: 8/8 chiamate Terra riuscite, artefatto finalizzato e hash persistito prima dello stato `awaiting_human_approval`. |
| 15 | RISOLTO_LOCALMENTE | Sei flagship distinte e interattive, verificate anche in Chrome. |
| 16 | RISOLTO_LOCALMENTE | Card e routing usano le app preview reali. |
| 17 | RISOLTO_LOCALMENTE | Prototype e Production distinti. |
| 18 | RISOLTO_LOCALMENTE | Production crea workspace multi-file reale e validabile. |
| 19 | VERIFICATO_ESTERNO | CI e CodeQL GitHub-hosted sono verdi sull'esatto commit preview `bc5d7263623d3a58f7388e28afc90937406301d4`, inclusivo di `0026` e recovery SSO. |
| 20 | RISOLTO_LOCALMENTE | Typecheck, lint, **451/451** test, build client/SSR e smoke Netlify locali verdi. |

## P1 operativo esterno: secret OAuth nella storia

`npm run security:history` rileva la stessa credenziale in `src/lib/auth/preview.ts` nei commit raggiungibili `30ec14f`, `6e4bbe1` e `7627c1c`. Il valore non è riportato qui. Lo scan del worktree corrente riporta zero finding.

Il codice e il worktree non hanno P0/P1 locali aperti. Per chiudere il rischio operativo storico servono azioni esterne e coordinate:

1. revoca/rotazione della credenziale presso il provider, con prova;
2. decisione coordinata sulla riscrittura della storia Git;
3. eventuale force push di tutti i riferimenti interessati.

La riscrittura/force push è incompatibile con il divieto esplicito corrente e non è stata tentata.

## Attivazioni e prove esterne ancora necessarie

1. Production resta disattivato: qualsiasi approvazione del Human Gate o pubblicazione richiede un'autorizzazione esplicita separata.
2. Stripe Test Mode/Test Clock con Checkout, webhook provider, invoice, rinnovo, cancellazione, failure e Portal reali; Stripe è ancora disattivato.
3. Il percorso OpenAI `gpt-5.6-terra` tramite Netlify AI Gateway è verificato per una singola generazione Prototype/Auto. Restano da verificare i costi provider, perché la telemetria corrente riporta `costKind` sconosciuto, e gli eventuali limiti/provider evidence esterni; nessun ulteriore test AI è autorizzato implicitamente.
4. Workspace/Twin runner remoti con isolamento, egress, replay store e report firmati osservati. La prova Terra corrente non costituisce evidence Twin, Echo o Swift.
5. Login e DB preview sono verificati; restano OAuth esterno, storage e integrazioni reali per un workspace Production.
6. Fonti reali per Warden, Nimbus e Augur; nessun provisioning automatico senza approvazione.
7. Harbor runner, secret/sweeper e provider reali con evidence firmata di deploy e rollback.
8. Dependabot e required checks/branch protection; CI e CodeQL sull'esatto SHA `bc5d7263623d3a58f7388e28afc90937406301d4` sono già verdi.
9. EAS, Apple e Google con signing e submission evidence reali, incluso un Google Play release ID specifico e verificato.

Questi punti non sono sostituibili con fixture locali. Il Deploy Preview privato dell'esatto commit `bc5d7263623d3a58f7388e28afc90937406301d4` è operativo per frontend, funzioni, DB, login e una generazione Prototype/Auto Terra end-to-end fino al Human Gate. L'artefatto è finalizzato, ma non è stato approvato né pubblicato. Stripe e Production restano spenti.
