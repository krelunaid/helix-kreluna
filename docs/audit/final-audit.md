# Audit finale Helix / Kreluna

Data: 2026-08-21

Ramo di lavoro: `fix/helix-audit-20260820`

Deploy Preview verificato prima del fix corrente: `b4b62c10b9a5b6b98054fae7a3195e5e76e6817e`

## Verdetto

**Il Deploy Preview privato del commit `b4b62c10b9a5b6b98054fae7a3195e5e76e6817e` ha database isolato con migrazioni `0001`–`0025`, login verificato e flag Terra/coppia Gateway configurati soltanto nel preview. Il primo Generate reale si è fermato con `BUILD_JOB_ENQUEUE_FAILED` prima di qualsiasi chiamata AI; un rimborso operativo idempotente è stato applicato manualmente e il saldo è tornato a 50. Il fix atomico `0026` e il recovery del dispatch protetto sono verdi localmente ma, al cutoff delle prove di questo snapshot, non ancora verificati dai gate hosted né deployati.**

- Requisiti 1–62: **38 RISOLTO_LOCALMENTE / 2 PROVA_ESTERNA_SU_SHA_PRECEDENTE_MA_FINAL_SHA_PENDING / 22 PARZIALE_ESTERNO / 0 MANCANTE**.
- Definition of Done: **16 RISOLTO_LOCALMENTE / 2 PROVA_ESTERNA_SU_SHA_PRECEDENTE_MA_FINAL_SHA_PENDING / 2 PARZIALE_ESTERNO / 0 MANCANTE**.
- P0/P1 locali aperti: **0**.
- P1 operativo esterno: **1**, limitato a una credenziale OAuth preview ancora presente nella storia Git raggiungibile.

`RISOLTO_LOCALMENTE` significa che il comportamento è implementato e coperto da prove locali pertinenti. Non implica un deploy, un pagamento, una chiamata AI, un browser runner, un database gestito o una submission Store reali. `PROVA_ESTERNA_SU_SHA_PRECEDENTE_MA_FINAL_SHA_PENDING` significa che esiste prova reale sul Deploy Preview `b4b62c10b9a5b6b98054fae7a3195e5e76e6817e`, ma non sul diff locale corrente che aggiunge la migrazione `0026` e il recovery SSO. `PARZIALE_ESTERNO` significa che il percorso locale è implementato e fail-closed, ma l'accettazione completa richiede credenziali, infrastruttura o prove esterne non autorizzate/disponibili. `MANCANTE` significa che manca ancora la capacità locale centrale.

## Confine delle prove

- Nessun servizio esterno è stato simulato come prova di produzione.
- Non sono state eseguite chiamate AI fatturate (né xAI storiche né OpenAI `gpt-5.6-terra`), transazioni Stripe, EAS build, signing o submission Store. Il Deploy Preview privato di `b4b62c10b9a5b6b98054fae7a3195e5e76e6817e` usa un branch Netlify Database isolato con migrazioni `0001`–`0025`; il login del tester è stato verificato e flag Terra/coppia Gateway sono configurati soltanto in quel contesto, senza invocazioni provider verificate.
- È stata autorizzata e avviata una sola generazione reale, ma l'operazione è terminata con `BUILD_JOB_ENQUEUE_FAILED` prima della creazione del job e prima di qualsiasi `ai_call`. Un rimborso operativo idempotente di 8 crediti è stato applicato manualmente: progetto terminale `error`, `credits_spent=0`, saldo tester 50, zero job e zero chiamate AI. Il saldo include il grant iniziale da 10 e un accredito preview aggiuntivo di test da 40 autorizzato; non è un pagamento o top-up Stripe.
- Il diff locale corrente aggiunge la creazione progetto/enqueue atomica con migrazione `0026` e un dispatch/recovery compatibile con la protezione SSO del preview. Stripe e Production restano spenti; al momento di questo snapshot il diff non è ancora committato, pubblicato o deployato.
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

- Deploy privato esatto: `b4b62c10b9a5b6b98054fae7a3195e5e76e6817e`, protetto da Netlify Team Login.
- Database preview isolato e attestato, con migrazioni `0001`–`0025`; tester pre-provisionato senza signup pubblico.
- Login password riuscito in Chrome.
- Un solo Generate avviato con prompt minimale; errore `BUILD_JOB_ENQUEUE_FAILED` prima del provider, zero righe `ai_calls` e nessuna prova di esecuzione Terra.
- Rimborso operativo idempotente applicato manualmente: saldo 50, comprensivo dell'accredito preview aggiuntivo di test autorizzato. Nessun secondo tentativo è stato eseguito senza una nuova conferma.

## Matrice requisiti 1–62

| # | Stato | Evidenza locale o limite residuo |
| ---: | --- | --- |
| 1 | PROVA_ESTERNA_SU_SHA_PRECEDENTE_MA_FINAL_SHA_PENDING | Il Deploy Preview privato di `b4b62c1` serve frontend e funzioni server, usa un DB isolato migrato e consente il login. Il primo Generate si è fermato prima del provider; il fix `0026`/SSO corrente attende commit, CI e deploy. |
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
| 17 | PARZIALE_ESTERNO | Supervisor seleziona dipendenze, checkpoint, retry, budget e gate; manca una generazione completa con modelli/provider live. |
| 18 | PARZIALE_ESTERNO | Nova produce PRD JSON/Markdown strutturato; provider AI live non verificato. |
| 19 | PARZIALE_ESTERNO | Atlas produce architettura, data flow, route/API/DB/auth/integration; provider live non verificato. |
| 20 | PARZIALE_ESTERNO | Lumen produce tre direzioni distinte e scoring; selezione tramite modello live non verificata. |
| 21 | PARZIALE_ESTERNO | Forge UI, Logic e Integration sono separati e generano binding/client; provider AI live non verificato. |
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
| 34 | PARZIALE_ESTERNO | Iris consuma criteri, Twin/Echo/Swift, errori e screenshot; modello/runner live non eseguiti. |
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
| 59 | PROVA_ESTERNA_SU_SHA_PRECEDENTE_MA_FINAL_SHA_PENDING | CI e CodeQL GitHub-hosted sono verdi sull'esatto commit preview `b4b62c10b9a5b6b98054fae7a3195e5e76e6817e`; il diff locale `0026`/SSO attende ancora il proprio SHA e i gate hosted. |
| 60 | RISOLTO_LOCALMENTE | Suite locale copre accesso, guest, crediti, billing, queue, gate, provider failure, score, deploy/store e locale. |
| 61 | PARZIALE_ESTERNO | Warden ha source autenticata, freshness, dedupe, persistenza e policy senza autopublish; monitoring reale assente. |
| 62 | PARZIALE_ESTERNO | Nimbus decide runtime/DB/storage/CDN/costi da evidence verificata e resta fail-closed; provisioning/provider live assenti. |

## Definition of Done

| # | Stato | Valutazione |
| ---: | --- | --- |
| 1 | PROVA_ESTERNA_SU_SHA_PRECEDENTE_MA_FINAL_SHA_PENDING | Frontend, funzioni server, DB isolato e login sono stati provati sul Deploy Preview `b4b62c1`. La generazione non ha raggiunto Terra; il fix `0026`/SSO resta da pubblicare e probare. |
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
| 14 | PARZIALE_ESTERNO | Contratti impediscono `done` senza artefatti, ma agenti/provider live non sono stati eseguiti. |
| 15 | RISOLTO_LOCALMENTE | Sei flagship distinte e interattive, verificate anche in Chrome. |
| 16 | RISOLTO_LOCALMENTE | Card e routing usano le app preview reali. |
| 17 | RISOLTO_LOCALMENTE | Prototype e Production distinti. |
| 18 | RISOLTO_LOCALMENTE | Production crea workspace multi-file reale e validabile. |
| 19 | PROVA_ESTERNA_SU_SHA_PRECEDENTE_MA_FINAL_SHA_PENDING | CI e CodeQL GitHub-hosted sono verdi sull'esatto commit preview `b4b62c10b9a5b6b98054fae7a3195e5e76e6817e`; il diff `0026`/SSO non ha ancora uno SHA verificato dai gate hosted. |
| 20 | RISOLTO_LOCALMENTE | Typecheck, lint, **451/451** test, build client/SSR e smoke Netlify locali verdi. |

## P1 operativo esterno: secret OAuth nella storia

`npm run security:history` rileva la stessa credenziale in `src/lib/auth/preview.ts` nei commit raggiungibili `30ec14f`, `6e4bbe1` e `7627c1c`. Il valore non è riportato qui. Lo scan del worktree corrente riporta zero finding.

Il codice e il worktree non hanno P0/P1 locali aperti. Per chiudere il rischio operativo storico servono azioni esterne e coordinate:

1. revoca/rotazione della credenziale presso il provider, con prova;
2. decisione coordinata sulla riscrittura della storia Git;
3. eventuale force push di tutti i riferimenti interessati.

La riscrittura/force push è incompatibile con il divieto esplicito corrente e non è stata tentata.

## Attivazioni e prove esterne ancora necessarie

1. Il Netlify Database preview è creato, isolato e migrato fino a `0025`; il tester è pre-provisionato, il saldo di test è 50 e flag Terra/coppia Gateway sono configurati solo nel preview. Restano da pubblicare il fix corrente, applicare `0026` sull'esatto branch DB e verificare il nuovo dispatch prima di un altro Generate.
2. Stripe Test Mode/Test Clock con Checkout, webhook provider, invoice, rinnovo, cancellazione, failure e Portal reali.
3. Esecuzione di OpenAI `gpt-5.6-terra` tramite Netlify AI Gateway, con telemetria confrontata ai dati Netlify/OpenAI e limiti provider-side. Il primo tentativo autorizzato non ha raggiunto il provider; un secondo tentativo richiede una nuova conferma esplicita.
4. Workspace/Twin runner remoti con isolamento, egress, replay store e report firmati osservati.
5. Login e DB preview di base sono verificati; restano OAuth esterno, storage e integrazioni reali per un workspace Production.
6. Fonti reali per Warden, Nimbus e Augur; nessun provisioning automatico senza approvazione.
7. Harbor runner, secret/sweeper e provider reali con evidence firmata di deploy e rollback.
8. Run GitHub-hosted di CI/CodeQL sull'esatto SHA che includerà la migrazione `0026` e il recovery SSO, oltre a Dependabot e required checks/branch protection.
9. EAS, Apple e Google con signing e submission evidence reali, incluso un Google Play release ID specifico e verificato.

Questi punti non sono sostituibili con fixture locali. Il Deploy Preview privato `b4b62c1` è operativo per frontend, funzioni, DB e login, ma il primo Generate si è fermato prima di Terra ed è stato rimborsato. Il diff locale `0026`/SSO è stabilizzato ma non ancora pubblicato né deployato al momento di questo snapshot. Stripe e Production restano spenti; Terra non viene ancora dichiarato verificato end-to-end.
