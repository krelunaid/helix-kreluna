# Audit finale Helix / Kreluna

Data: 2026-08-21

Ramo di lavoro: `fix/helix-audit-20260820`

Commit di base: `a194ffce842db62bfa2d32ded52ea199f50f189e`

## Verdetto

**Il supporto Netlify Database e la migrazione dell'inference a OpenAI `gpt-5.6-terra` tramite Netlify AI Gateway sono stabilizzati localmente; l'esatto SHA finale non è ancora verificato end-to-end sui provider.**

- Requisiti 1–62: **38 RISOLTO_LOCALMENTE / 2 PROVA_ESTERNA_SU_SHA_PRECEDENTE_MA_FINAL_SHA_PENDING / 22 PARZIALE_ESTERNO / 0 MANCANTE**.
- Definition of Done: **16 RISOLTO_LOCALMENTE / 2 PROVA_ESTERNA_SU_SHA_PRECEDENTE_MA_FINAL_SHA_PENDING / 2 PARZIALE_ESTERNO / 0 MANCANTE**.
- P0/P1 locali aperti: **0**.
- P1 operativo esterno: **1**, limitato a una credenziale OAuth preview ancora presente nella storia Git raggiungibile.

`RISOLTO_LOCALMENTE` significa che il comportamento è implementato e coperto da prove locali pertinenti. Non implica un deploy, un pagamento, una chiamata AI, un browser runner, un database gestito o una submission Store reali. `PROVA_ESTERNA_SU_SHA_PRECEDENTE_MA_FINAL_SHA_PENDING` significa che esiste prova reale su commit precedenti al diff corrente: Netlify funzionale su `3e0af1e3a6047fc13e34972e62ae243f30b203fa`, branch preview su `a3a25556d7369f454e8a976f3dd1e7a0c8395e74` e CI/CodeQL su `842f7bee72a9503271f3c9ab8fc5f80c74a68764`, ma non sull'esatto SHA finale della migrazione Terra di questo snapshot. `PARZIALE_ESTERNO` significa che il percorso locale è implementato e fail-closed, ma l'accettazione completa richiede credenziali, infrastruttura o prove esterne non autorizzate/disponibili. `MANCANTE` significa che manca ancora la capacità locale centrale.

## Confine delle prove

- Nessun servizio esterno è stato simulato come prova di produzione.
- Non sono state eseguite chiamate AI fatturate (né xAI storiche né OpenAI `gpt-5.6-terra`), transazioni Stripe, migrazioni DB remote, EAS build, signing o submission Store. È stato creato un Netlify Database, ancora senza migrazioni applicate, ed è stata deployata una branch preview isolata del commit `a3a25556d7369f454e8a976f3dd1e7a0c8395e74`; quella preview precedente non è operativa perché mancano nuove credenziali Grok OAuth e la configurazione AI allora basata su xAI. Il diff corrente, che migra l'inference a Netlify AI Gateway e la mantiene disabilitata per default, non è stato deployato.
- Il sito precedente sul commit `3e0af1e` resta live su Netlify. La branch preview isolata di `a3a25556d7369f454e8a976f3dd1e7a0c8395e74` fallisce chiusa per le credenziali esterne mancanti. Il commit `842f7bee72a9503271f3c9ab8fc5f80c74a68764`, che integra Netlify Database, è pubblicato sul ramo e ha CI e CodeQL verdi; soltanto la migrazione Terra corrente è ancora un diff locale senza SHA hosted al momento di questo snapshot.
- Non sono stati eseguiti merge o force push, né cancellati rami o file.
- Il runner Production, Twin, Warden, Nimbus, Augur e Store falliscono chiusi quando mancano adapter, evidence o credenziali reali.
- La QA Chrome descritta sotto è una verifica manuale della build locale compilata; non è un report Twin remoto firmato.

## Gate finali locali

Ambiente locale: Node `22.23.2`, npm `10.9.8`. L'installazione esistente è stata verificata; `npm ci` resta il gate della CI GitHub-hosted.

| Gate | Esito |
| --- | --- |
| TypeScript strict | PASS |
| ESLint completo | PASS, 0 errori; 5 warning legacy `react-refresh` in `src/lib/i18n.tsx` |
| Suite completa | PASS, **413/413** |
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

## Matrice requisiti 1–62

| # | Stato | Evidenza locale o limite residuo |
| ---: | --- | --- |
| 1 | PROVA_ESTERNA_SU_SHA_PRECEDENTE_MA_FINAL_SHA_PENDING | Il sito live sul commit `3e0af1e` serve frontend e funzioni server reali. Una branch preview isolata di `a3a2555` è stata creata, ma fallisce chiusa perché mancano nuove credenziali Grok OAuth e la configurazione AI allora basata su xAI. Il diff corrente usa Terra tramite Netlify AI Gateway, disabilitato per default, e non è ancora deployato. |
| 2 | RISOLTO_LOCALMENTE | Inventario env, gruppi all-or-none e startup fail-closed. Nei runtime hosted è obbligatorio `DATABASE_URL` oppure la connessione SDK `NETLIFY_DB_URL`; nei runtime Netlify l'SDK è l'autorità unica per app e Better Auth, i contesti branch rifiutano URL divergenti e non ripiegano su PGLite. Solo il locale conserva PGLite; queue, Stripe e limiti guest non ricadono nei fallback locali. |
| 3 | PARZIALE_ESTERNO | Worktree senza secret e scanner history-aware; revoca/rotazione provider e bonifica storia non eseguite. |
| 4 | PARZIALE_ESTERNO | Checkout hosted, webhook raw-body verificato, inbox, ledger, subscription/top-up e Portal mode-aware implementati; nessun flusso Stripe Test Mode reale. |
| 5 | RISOLTO_LOCALMENTE | Crediti atomici/idempotenti, saldo non negativo, ledger coerente e test concorrenti. |
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
| 59 | PROVA_ESTERNA_SU_SHA_PRECEDENTE_MA_FINAL_SHA_PENDING | CI e CodeQL GitHub-hosted sono verdi su `842f7bee72a9503271f3c9ab8fc5f80c74a68764`, che include il supporto Netlify Database; la migrazione Terra attende la verifica hosted sull'esatto SHA finale. |
| 60 | RISOLTO_LOCALMENTE | Suite locale copre accesso, guest, crediti, billing, queue, gate, provider failure, score, deploy/store e locale. |
| 61 | PARZIALE_ESTERNO | Warden ha source autenticata, freshness, dedupe, persistenza e policy senza autopublish; monitoring reale assente. |
| 62 | PARZIALE_ESTERNO | Nimbus decide runtime/DB/storage/CDN/costi da evidence verificata e resta fail-closed; provisioning/provider live assenti. |

## Definition of Done

| # | Stato | Valutazione |
| ---: | --- | --- |
| 1 | PROVA_ESTERNA_SU_SHA_PRECEDENTE_MA_FINAL_SHA_PENDING | Frontend e funzioni server reali sono stati probati sul deploy Netlify di `3e0af1e`; la branch preview di `a3a2555` resta bloccata dalle credenziali Grok OAuth e dalla configurazione AI storica mancante. La migrazione corrente a Terra/Netlify AI Gateway non è stata deployata. |
| 2 | PARZIALE_ESTERNO | Worktree senza secret; la storia contiene ancora la credenziale OAuth preview. |
| 3 | RISOLTO_LOCALMENTE | Nessun piano/top-up accredita senza evento di pagamento server-side verificato. |
| 4 | RISOLTO_LOCALMENTE | Crediti atomici e idempotenti. |
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
| 19 | PROVA_ESTERNA_SU_SHA_PRECEDENTE_MA_FINAL_SHA_PENDING | CI e CodeQL GitHub-hosted sono verdi su `842f7bee72a9503271f3c9ab8fc5f80c74a68764`; la migrazione Terra attende commit, push e run hosted sul proprio SHA. |
| 20 | RISOLTO_LOCALMENTE | Typecheck, lint, **413/413** test, build client/SSR e smoke Netlify locali verdi. |

## P1 operativo esterno: secret OAuth nella storia

`npm run security:history` rileva la stessa credenziale in `src/lib/auth/preview.ts` nei commit raggiungibili `30ec14f`, `6e4bbe1` e `7627c1c`. Il valore non è riportato qui. Lo scan del worktree corrente riporta zero finding.

Il codice e il worktree non hanno P0/P1 locali aperti. Per chiudere il rischio operativo storico servono azioni esterne e coordinate:

1. revoca/rotazione della credenziale presso il provider, con prova;
2. decisione coordinata sulla riscrittura della storia Git;
3. eventuale force push di tutti i riferimenti interessati.

La riscrittura/force push è incompatibile con il divieto esplicito corrente e non è stata tentata.

## Attivazioni e prove esterne ancora necessarie

1. Il Netlify Database è stato creato e il commit pubblicato `842f7bee72a9503271f3c9ab8fc5f80c74a68764` integra `@netlify/database` `2.0.0`, usa una sola connessione SDK-authoritative, isola branch/deploy preview e applica le migrazioni `0001`–`0025` soltanto dopo una build verde. Restano da applicare le migrazioni remote e da configurare nuove credenziali `GROK_AUTH_CLIENT_ID` / `GROK_AUTH_CLIENT_SECRET` per il broker OAuth. L'inference usa OpenAI `gpt-5.6-terra`: resta disabilitata finché il runtime non imposta esplicitamente `HELIX_AI_GATEWAY_ENABLED=true` e non riceve insieme `NETLIFY_AI_GATEWAY_KEY` / `NETLIFY_AI_GATEWAY_BASE_URL`. Dopo commit/push della migrazione Terra va deployata una preview dell'esatto SHA finale e vanno probati SSR, server function, API, auth, CSP e scheduled/background functions.
2. Stripe Test Mode/Test Clock con Checkout, webhook provider, invoice, rinnovo, cancellazione, failure e Portal reali.
3. Esecuzione fatturata di OpenAI `gpt-5.6-terra` tramite Netlify AI Gateway, con telemetria confrontata ai dati Netlify/OpenAI e limiti provider-side; nessuna chiamata a pagamento è stata autorizzata in questo audit.
4. Workspace/Twin runner remoti con isolamento, egress, replay store e report firmati osservati.
5. Verifica reale del Netlify Database gestito, dell'auth, dello storage e delle integrazioni per un workspace Production.
6. Fonti reali per Warden, Nimbus e Augur; nessun provisioning automatico senza approvazione.
7. Harbor runner, secret/sweeper e provider reali con evidence firmata di deploy e rollback.
8. Run GitHub-hosted di CI/CodeQL sull'esatto SHA finale, oltre a Dependabot e required checks/branch protection.
9. EAS, Apple e Google con signing e submission evidence reali, incluso un Google Play release ID specifico e verificato.

Questi punti non sono sostituibili con fixture locali e richiedono nuove credenziali o autorizzazioni esplicite. Il sito del commit `3e0af1e` resta pubblicato; la branch preview di `a3a2555` esiste ma non è operativa senza le credenziali esterne. Il supporto Netlify Database è pubblicato nel commit `842f7bee`; la migrazione Terra/Netlify AI Gateway di questo snapshot resta localmente stabilizzata e fail-closed, ma non viene dichiarata deployata, fatturata o verificata end-to-end sui provider.
