# Audit Helix — Follow-up 3

Data: 2026-08-20

Stato: **core del servizio runner Production e secret gate CI stabilizzati localmente; provider sandbox e pipeline Production restano disabilitati**.

## Implementato

- Il protocollo runner è passato a `1.1.0`: gli step successivi a un errore non possono più apparire come misurati. Usano `not_run`, evidence `not_run`, timestamp/hash null e rete `not_applied`; l'ordine dei sei step è obbligatorio.
- È stato aggiunto un servizio server-side provider-neutral che verifica limite body, timestamp, HMAC sul body esatto, nonce header/body, claim anti-replay atomico, schema Zod, candidate e profilo lockfile prima di creare una sandbox.
- Replay store e sandbox factory sono dipendenze obbligatorie. Non esiste un fallback in memoria utilizzabile per errore in produzione.
- Il servizio accetta soltanto il profilo fisso `node_web_v1`; nessun comando o argomento arriva dalla richiesta:
  1. `npm ci --ignore-scripts --no-audit --no-fund`;
  2. `npm run typecheck --`;
  3. `npm run lint --`;
  4. `npm run test --`;
  5. `npm run build --`;
  6. `npm audit --omit=dev --audit-level=high --json`.
- La sandbox riceve un root fisso, file già hash-verificati, env minima non ereditata, massimo 32 processi e limiti server-side non ampliabili dal client.
- La rete parte disabilitata. Solo install e audit possono richiedere `registry.npmjs.org`; ogni step tenta il reset a `disabled` in `finally`.
- Timeout, exit non-zero, errore di processo, stdout/stderr combinati oltre 16 KiB o reset rete fallito bloccano gli step successivi. L'interfaccia richiede al provider di terminare l'intero process tree sul timeout.
- Stdout/stderr non vengono restituiti. Il servizio redige pattern sensibili, limita i byte e conserva soltanto SHA-256 e dettaglio generato dal servizio. Anche il client legge la risposta HTTP in streaming con un limite di 256 KiB, incluso quando manca `Content-Length`.
- La sandbox viene distrutta in `finally`. Un fallimento della distruzione produce 503 senza report firmato; `destroyed: true` viene firmato soltanto dopo cleanup confermato.
- Il test end-to-end collega adapter Helix, servizio HTTP reale locale e sandbox finta iniettata: un report verde viene accettato; uno step fallito viene rifiutato dal client.

## Secret scanning e CI

- Lo scanner leggero duplicato è stato sostituito da un entrypoint compatibile che usa l'unica implementazione robusta.
- `security:secrets` esegue la modalità `--worktree-only` dello scanner storico: stessi detector, file tracked e untracked, valori sempre redatti e nessuna allowlist applicabile al worktree.
- Tre fixture sintetiche che sembravano credenziali sono ora costruite a runtime, senza indebolire i detector.
- Il test CI verifica che il gate robusto sia eseguito prima di `npm ci`.
- Lo scan corrente del worktree passa con zero finding. Lo scan completo continua correttamente a fallire per le tre occorrenze OAuth storiche; non sono state allowlistate né dichiarate ruotate.

## File principali

- `src/lib/server/workspace-runner.ts`
- `src/lib/server/workspace-runner-service.ts`
- `scripts/workspace-runner-adapter.test.mjs`
- `scripts/workspace-runner-service.test.mjs`
- `scripts/secret-history-scan.mjs`
- `scripts/secret-history-scan.test.mjs`
- `scripts/secret-scan.mjs`
- `scripts/ci-policy.test.mjs`
- `scripts/ai-telemetry-budget.test.mjs`
- `scripts/build-command-safety.test.mjs`
- `scripts/workspace-artifact.test.mjs`
- `scripts/storm-load.test.mjs`
- `package.json`

## Verifiche

| Verifica                             | Risultato                                                            |
| ------------------------------------ | -------------------------------------------------------------------- |
| Adapter + servizio runner mirati     | PASS — 13 test/assertion group                                       |
| Test repository                      | PASS — 233/233                                                       |
| Typecheck strict                     | PASS                                                                 |
| Lint                                 | PASS — 0 errori, 5 warning Fast Refresh legacy in `src/lib/i18n.tsx` |
| `npm run build` client + SSR Netlify | PASS                                                                 |
| Smoke output Netlify                 | PASS                                                                 |
| Secret scan robusto worktree         | PASS — 0 finding                                                     |
| Secret scan history                  | FAIL ATTESO — 3 occorrenze storiche, 0 nel worktree                  |
| Audit dipendenze production          | PASS — 0 vulnerabilità                                               |
| Audit dipendenze completo            | FAIL — 10 high transitivi nella toolchain Netlify                    |
| `git diff --check`                   | PASS                                                                 |

I warning build già documentati per moduli Node `pg` nel pass client e `eval` interno a PGlite restano visibili.

Un primo rerun completo ha esposto contesa intermittente nella fixture HTTP Storm: il server di test riceveva soltanto 5 richieste su 12 prima della deadline corta. La fixture ora risponde senza timer artificiale e usa i massimi limiti ammessi dal runner soltanto come margine di scheduling; quattro esecuzioni concorrenti mirate e il successivo rerun completo sono verdi. Il runner continua a imporre la propria deadline e non aumenta i limiti di prodotto.

## Env e migration

- Nessuna nuova env è stata aggiunta rispetto alla coppia runner già documentata.
- Nessuna migration DB è stata aggiunta.

## NON RISOLTO / NON VERIFICATO

- **NON RISOLTO — adapter sandbox reale:** nessun adapter Cloudflare Sandbox o altro provider implementa ancora l'interfaccia del servizio.
- **NON RISOLTO — replay store persistente:** il contratto è obbligatorio e testato con una finta atomica, ma non è collegato a Durable Object/DB/KV.
- **NON RISOLTO — deploy del servizio runner:** non esiste endpoint pubblicato, container, Worker, dominio o secret configurato.
- **NON VERIFICATO — isolamento, PID/memoria/disco, egress e kill process tree reali:** sono vincoli dell'interfaccia e dei test contrattuali, non prove su un container esterno.
- **NON RISOLTO — generazione/finalizzazione Production:** Helix non genera ancora app/server/DB/auth Production, non persiste report runner append-only e non sigilla una release multi-file.
- **NON RISOLTO — secret storico:** rotazione/revoca provider e riscrittura Git coordinata richiedono azioni esterne non eseguite.

Nessun commit, push, deploy, container, migration DB, browser QA completato, chiamata xAI, pagamento o upload store è stato eseguito.
