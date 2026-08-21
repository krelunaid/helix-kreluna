# Audit Helix — Follow-up 4

Data: 2026-08-20

Stato: **contratto del grafo sorgente Production stabilizzato localmente; generazione Production, sandbox provider reale e finalizzazione restano intenzionalmente disabilitate**.

## Risolto in questo follow-up

- I requisiti Production sono ora un contratto Zod tipizzato e canonico. Separano profilo runtime, modello e sensibilità dei dati, storage, identità, ruoli, operazioni server, privilegi, monitoraggio, integrazioni e API.
- `docs/prd.json`, `docs/architecture.json` e `docs/requirements.json` devono contenere lo stesso snapshot tipizzato. Un PRD o un'architettura che richiede account, dati privati o API non può essere degradato silenziosamente a sito statico.
- È definito un grafo sorgente per Prism, Basalt, Key, Nexus, Vault, Quartz, Forge Integration e Nimbus. Ordine e dipendenze sono espliciti; Quartz dipende dallo schema e dalle API definitive, non revisiona una fase precedente incompleta.
- Ogni artefatto ha un contract file canonico, output, test ed evidence path. Il relativo SHA-256 lega il contratto all'esatto insieme ordinato di path, ruoli e hash dei file.
- Le dipendenze dei nodi contengono l'hash dell'artefatto upstream. La verifica ricostruisce l'intero grafo e rileva alterazioni di candidate, contract, file, dependency ID, dependency hash e graph hash.
- La provenance copre ogni file del candidate esattamente una volta. Owner e ruolo devono essere compatibili; package, lockfile, entrypoint, PRD, architettura, requirements, env, deploy, test, README, decisioni e score hanno owner vincolati.
- Un agente Production non può appropriarsi di un file che non compare nei propri output dichiarati. Test, migration, deployment ed environment path devono avere il ruolo workspace corretto.
- I requisiti Stripe impongono servizio autenticato, persistenza, secret server canonici, webhook firmato, idempotenza e ledger. OAuth richiede identità e callback server. Le integrazioni client possono usare soltanto configurazioni esplicitamente pubbliche `VITE_`/`PUBLIC_`, mai secret, token o chiavi private.
- Le mutazioni Production richiedono idempotenza; mutazioni pubbliche e webhook richiedono anche una policy di rate limit esplicita.
- Key, Vault e Forge sono collegati semanticamente: ruoli, route protette, accesso e modalità auth/transport devono combaciare. Nexus deve corrispondere esattamente alle integrazioni richieste e Stripe non può esistere senza contratto webhook verificabile.
- Prism deve possedere schema e migration; Quartz deve revisionare l'esatto set di migration. Un verdetto `changes_required` blocca Quartz e propaga il blocco a Nimbus.
- `.env.example` prova soltanto i nomi documentati. La disponibilità esterna è un inventario separato di nomi, senza valori; nomi duplicati, non documentati o mancanti producono errore. Key, Nexus e Nimbus diventano `not_configured` e i consumer dipendenti diventano `blocked`.
- Gli stati del grafo sono soltanto `structurally_present`, `not_required`, `not_configured` e `blocked`. Ogni nodo usa `evidence: structural` e `runtimeExecution: not_run`; non esiste uno stato `done`, `passed`, `deployed` o una prova misurata inventata.
- Il manifest workspace include ora anche la capability `integrations`. Un manifest Production richiede esplicitamente frontend, test, deployment e monitoring implementati; una dichiarazione senza evidence path viene rifiutata.
- Il workspace Prototype dichiara integrazioni, backend, API, DB, auth, deploy e monitoring come non configurati. Non eredita implicitamente capacità Production.

## File principali modificati

- `src/lib/production-artifact-graph.ts`
- `src/lib/workspace.ts`
- `src/lib/server/release/workspace.ts`
- `scripts/production-artifact-graph.test.mjs`
- `scripts/workspace-artifact.test.mjs`
- `docs/audit/final-audit.md`

## Verifiche

| Verifica                    | Risultato                                                                               |
| --------------------------- | --------------------------------------------------------------------------------------- |
| Typecheck strict            | PASS                                                                                    |
| Test grafo Production       | PASS — 15/15                                                                            |
| Test workspace              | PASS — 6/6                                                                              |
| Test repository             | PASS — 248/248                                                                          |
| Lint                        | PASS — 0 errori, 5 warning Fast Refresh legacy in `src/lib/i18n.tsx`                    |
| Build client + SSR Netlify  | PASS                                                                                    |
| Smoke output Netlify        | PASS — SSR, PWA, header, `/api/auth/*`, flagship localizzata e route server             |
| Secret scan worktree        | PASS — 297 file esistenti, 0 finding; Git elenca 298 path includendo un tracked rimosso |
| Audit dipendenze production | PASS — 0 vulnerabilità                                                                  |
| Audit dipendenze completo   | FAIL — 10 advisory high transitive; `npm audit fix --dry-run` non offre un fix completo |
| Secret scan storia Git      | FAIL atteso — tre occorrenze storiche della stessa credenziale OAuth, valore redatto    |

## NON RISOLTO

- **NON RISOLTO — generatore Production:** questo follow-up definisce e verifica il contratto del grafo sorgente, ma nessun agente ha generato un candidate Production reale. I fixture di test non sono un prodotto generato.
- **NON RISOLTO — attivazione del grafo:** i contratti sono marcati `disabled_contract_only` e non sono collegati alla disponibilità della modalità Production, al Human Gate o a Harbor. Questa è una protezione intenzionale finché il percorso completo non esiste.
- **NON RISOLTO — prove runtime:** `structurally_present` significa soltanto che file, contratti, ruoli, hash e relazioni sono coerenti. Non significa compilato, testato, sicuro, configurato o deployato.
- **NON RISOLTO — provider sandbox:** adapter, protocollo e core del runner esistono, ma nessun provider container/sandbox reale, replay store persistente o endpoint runner pubblicato è configurato.
- **NON RISOLTO — persistenza delle prove:** il report runner non è ancora persistito e associato al grafo sorgente come gate autorevole di finalizzazione Production.
- **NON RISOLTO — servizi esterni:** nessuna credenziale Stripe/OAuth, transazione, webhook, database Production, deploy Netlify live, monitoring esterno o store pipeline è stata configurata o simulata.
- **NON RISOLTO — debito dipendenze dev:** l'audit completo resta rosso per 10 advisory high transitive nella toolchain Netlify; l'audit delle sole dipendenze production è verde e `npm audit fix --dry-run` non offre una correzione completa applicabile dalla lockfile corrente.
- **NON RISOLTO — secret storico:** revoca/rotazione presso il provider e riscrittura coordinata della storia Git richiedono un'azione esterna esplicita e non sono state eseguite.

## Breaking change

- La capability workspace `integrations` è ora obbligatoria nei manifest Production.
- Ogni capability deve avere almeno un evidence path esistente.
- Un manifest Production deve dichiarare `monitoring: implemented`; `not_required` non è più sufficiente per una release Production.
- Il nuovo grafo sorgente è un contratto separato hash-bound al candidate e non abilita alcuna API pubblica.

Nessun commit, push, deploy preview/production, migration esterna, browser QA completato, chiamata AI fatturata, pagamento, webhook, store upload o rotazione credenziale è stato eseguito in questo follow-up.
