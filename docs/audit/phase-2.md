# Audit Helix — Fase 2

Data: 2026-08-20

Stato: **stabilizzata localmente; non pubblicata**.

## Risolto

- I piani a pagamento e i top-up falliscono chiusi con `PAYMENTS_NOT_AVAILABLE`; non modificano piano, saldo o ledger. La UI li mostra come non disponibili.
- Il grant Starter viene creato una sola volta. Tornare al piano free non accredita nuovi crediti.
- Addebiti e rimborsi passano da `apply_credit_entry`: saldo e ledger cambiano atomicamente, il saldo non può diventare negativo e ogni mutazione richiede una chiave idempotente.
- Create, iterate, hosting e pubblicazione web legano l'addebito alla mutazione applicativa. Hosting e publish condividono la stessa chiave; due publish concorrenti producono un solo addebito e una sola app pubblica.
- `getBuildJob` richiede una sessione verificata e controlla sia `job.userId` sia il proprietario del progetto.
- I job guest usano capability token casuali a 256 bit, hash SHA-256 a riposo, scadenza e scope per singolo job. Il DTO pubblico rimuove HTML interno, ownership, token, lease e credenziali tester.
- Gli errori RPC ora hanno status HTTP reali: `401`, `403`, `429` e `503`, non body di errore trasportati con `200`.
- La generazione guest usa quota persistente per IP trusted, budget richieste/byte/costo stimato, un solo job concorrente e lease con timeout.
- `publishGuest` è temporaneo (24 ore), tokenizzato, limitato per quota/concorrenza/dimensione e non indicizzato.
- HTML generato e preview usano sandbox ristretto e CSP con rete negata di default; sono rimossi popup, modali, same-origin e meta refresh.
- Le migration effettuano backfill dell'ownership dei job legacy, validano l'integrità delle app pubbliche e serializzano i deploy concorrenti con advisory lock PostgreSQL.
- Saldi negativi o duplicati legacy non vengono corretti arbitrariamente: la migration si ferma con un errore di riconciliazione esplicito.

## File principali modificati

- `migrations/0004_guest_security.sql`
- `migrations/0005_billing_integrity.sql`
- `migrations/0006_build_jobs_access.sql`
- `migrations/0007_public_app_integrity.sql`
- `src/lib/server/credits.ts`, `src/lib/server/vetra.ts`
- `src/lib/server/build-job-access.ts`, `src/lib/guest-build-access.ts`
- `src/lib/server/guest-abuse.server.ts`, `src/lib/guest-security.ts`
- `src/lib/generated-content-policy.ts`, `src/components/preview-frame.tsx`
- `src/lib/server/deploy.ts`, `src/lib/server/deploy-ownership.ts`
- `src/lib/server/http-error-status.ts`, `src/start.ts`, `src/server.ts`
- `src/lib/server/agents.ts`, `src/lib/agent-types.ts`
- `src/routes/try.tsx`, `src/routes/index.tsx`, `src/routes/studio.$id.tsx`
- `src/routes/pricing.tsx`, `src/routes/a.$slug.tsx`
- `scripts/billing-gating.test.mjs`, `scripts/credit-integrity.test.mjs`
- `scripts/build-job-access.test.mjs`, `scripts/guest-security.test.mjs`
- `scripts/migration-integrity.test.mjs`, `scripts/phase2-output-smoke.mjs`

## Verifiche

| Verifica | Risultato |
| --- | --- |
| Typecheck strict | PASS |
| Test repository | PASS — 82/82 |
| Lint | PASS — 0 errori, 9 warning non bloccanti |
| Build Netlify full-stack | PASS |
| Smoke SSR/API/server function | PASS |
| Billing RPC reale | PASS — paid/top-up `503` |
| Accesso RPC reale | PASS — signed-out `401`, token errato `403` |
| Rate limit RPC reale | PASS — concorrenza guest `429` |
| Publish concorrente sul DB del bundle | PASS — 1 addebito, 1 ledger, 1 app |
| Catena migration `0001–0007` | PASS, inclusi rerun e dati legacy |
| Secret scan tree corrente | PASS — 182 file tracciati |
| Audit dipendenze runtime (`--omit=dev`) | PASS — 0 vulnerabilità |
| `git diff --check` | PASS |

## Migration e preflight richiesti

- Applicare in ordine `0004` → `0007`; il migrator lo fa automaticamente sotto advisory lock.
- Prima del deploy eseguire query di audit per:
  - `profiles.credits_balance < 0`;
  - più `public_apps` pubbliche per lo stesso `project_id`;
  - più `public_apps` pubbliche con lo stesso `testers_code`.
- Se esistono anomalie, riconciliare manualmente contro ledger/progetto. Le migration falliscono deliberatamente e non cancellano né riscrivono dati.

## Env

- Opzionale in locale: `GUEST_RATE_LIMIT_SALT` (minimo 32 caratteri).
- Su Netlify il rate limiter usa `GUEST_RATE_LIMIT_SALT`; se assente usa `BETTER_AUTH_SECRET`. Nessun valore viene loggato.
- Stripe, Apple, Google Play, Expo/EAS e Turnstile non sono configurati o inventati.

## Ancora aperto

- **NON RISOLTO — pagamenti reali:** Checkout, webhook verificati, rinnovi, cancellazioni, failure handling, ricevute e payment ledger non esistono. Gli acquisti restano disabilitati in sicurezza.
- **NON RISOLTO — riconciliazione storica:** eventuali grant paid/top-up legacy e saldi negativi devono essere verificati sul database reale prima del deploy.
- **NON RISOLTO — job queue/heartbeat:** il job è salvato nel DB ma l'esecuzione dipende ancora dalla `Map` del processo; lease heartbeat, resume e crash recovery appartengono alla Fase 3.
- **NON RISOLTO — store:** il vecchio flusso contiene ancora readiness/status non veritieri e addebiti pack. Verrà bloccato/corretto in Fase 4; nessun deploy è autorizzato prima.
- **NON RISOLTO — CAPTCHA:** quota, budget e concorrenza sono attivi; Turnstile richiede credenziali/configurazione esterna e non è stato simulato.
- La CSP limita il browser; non equivale a una sandbox di rete a livello sistema. L'isolamento per origine/header sarà ulteriormente rafforzato nelle fasi QA/deploy.
- Il token tester pubblico legacy resta un codice condivisibile; i nuovi codici sono crittograficamente casuali a 12 caratteri e univoci, ma revoca/rotazione appartengono alla Fase 4.

## Breaking change

- Le letture job private senza sessione restituiscono `401`; ownership errata/token guest errato restituiscono `403`.
- Le chiamate guest oltre quota restituiscono `429`; acquisti non configurati restituiscono `503`.
- Le preview guest scadono dopo 24 ore e richiedono il capability token.
- `public_apps.project_id` e `testers_code` sono univoci per app pubbliche; metadata guest incoerenti vengono rifiutati dal database.
