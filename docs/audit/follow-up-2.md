# Audit Helix — Follow-up 2

Data: 2026-08-20

Stato: **candidate Production e adapter del runner isolato stabilizzati localmente; generazione e runner esterno restano disabilitati**.

## Implementato

- È stato introdotto un artefatto `helix_workspace_candidate` distinto dal manifest di release. Contiene l'elenco canonico dei file, hash per file, dimensioni, entrypoint, metadata e hash sorgente, ma nessun risultato di test inventato.
- La costruzione del candidate riusa le guardie workspace su path, collisioni Unicode/case-folding, limiti file/byte, contenuto secret-like e placeholder `.env.example`.
- Un candidate Production deve già contenere source, README, PRD, architettura, env example, migration, test, configurazione deploy, decisioni e score prima di poter essere inviato al runner.
- Il profilo `node_web_v1` richiede `package.json`, `package-lock.json` lockfile v2+ e script espliciti per typecheck, lint, test e build.
- L'adapter usa una coppia env opzionale e validata (`HELIX_WORKSPACE_RUNNER_URL`, `HELIX_WORKSPACE_RUNNER_SECRET`), HTTPS fuori loopback e HMAC-SHA256 bidirezionale.
- La richiesta non accetta comandi arbitrari: dichiara soltanto sei step fissi — install, typecheck, lint, test, build e security — con limiti di durata, output e processi.
- La risposta deve essere firmata, legata al nonce e all'hash esatto del candidate, dichiarare container distrutto, rete deny-by-default, egress registry soltanto per install/security, timestamp coerenti e sei prove misurate con exit code zero.
- Configurazione assente, candidate alterato, firma errata, nonce diverso, hash diverso o singolo step fallito bloccano il flusso con errori distinti.

## File modificati

- `src/lib/workspace.ts`
- `src/lib/server/workspace-runner.ts`
- `src/lib/env.server.ts`
- `.env.example`
- `scripts/workspace-runner-adapter.test.mjs`
- `docs/architecture/workspace-runner.md`
- `README.md`

## Confine reale

- Cloudflare Sandbox SDK è stato valutato sulle fonti ufficiali come target compatibile. Non è stato aggiunto al runtime Netlify e non è stato creato o distribuito alcun Worker/container.
- L'adapter è testato contro un servizio HTTP locale controllato che esercita il protocollo crittografico e i fallimenti. Questo è un test di contratto, non una compilazione reale di codice generato.
- Il runner esterno dovrà implementare cache anti-replay lato servizio, allowlist registry durante install, rete disabilitata negli step successivi, mapping comandi fisso, redazione log e distruzione in `finally`.
- Production continua a fallire con `PRODUCTION_PIPELINE_NOT_CONFIGURED` / `PRODUCTION_WORKSPACE_NOT_CONFIGURED`; nessuna UI o API è stata resa disponibile anticipatamente.

## Verifiche

| Verifica                                         | Risultato                                                            |
| ------------------------------------------------ | -------------------------------------------------------------------- |
| Candidate + adapter runner                       | PASS — 8/8 test mirati                                               |
| Test repository                                  | PASS — 221/221                                                       |
| Typecheck strict                                 | PASS                                                                 |
| Lint                                             | PASS — 0 errori, 5 warning Fast Refresh legacy in `src/lib/i18n.tsx` |
| `npm run build` client + SSR Netlify             | PASS                                                                 |
| Smoke SSR, server function, auth, PWA e flagship | PASS                                                                 |
| Secret scan worktree                             | PASS — 292 file, 0 finding                                           |
| Audit dipendenze production                      | PASS — 0 vulnerabilità                                               |
| `git diff --check`                               | PASS                                                                 |

I warning build già documentati relativi ai moduli Node `pg` nel pass client e a `eval` interno a PGlite restano visibili. Non sono interpretati come esecuzione del runner Production.

## Env e migration

- Nuove env opzionali: `HELIX_WORKSPACE_RUNNER_URL`, `HELIX_WORKSPACE_RUNNER_SECRET`. Devono essere configurate insieme; il secret deve avere almeno 32 caratteri. Nessun valore è stato creato o committato.
- Nessuna migration DB è stata aggiunta.

## NON RISOLTO / NON VERIFICATO

- **NON RISOLTO — runner isolato operativo:** nessun servizio esterno installa o esegue realmente i candidate.
- **NON RISOLTO — generazione multi-file Production:** Helix non genera ancora frontend, backend, DB, auth e test Production.
- **NON RISOLTO — finalizzazione Production:** il report firmato non viene ancora persistito come artefatto, trasformato in validation con evidence path e usato per sigillare un manifest release.
- **NON VERIFICATO — egress reale:** la policy `package_registry_only` è parte del contratto firmato, ma non è stata provata su un container pubblicato.
- **NON VERIFICATO — isolamento e timeout reali:** nessun codice non fidato è stato eseguito in un container esterno in questo follow-up.

Nessun commit, push, deploy, container, migration DB, chiamata xAI, pagamento, upload store o browser test è stato eseguito.
