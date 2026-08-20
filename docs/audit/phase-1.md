# Audit Helix — Fase 1

Data: 2026-08-20

Stato: **stabilizzata localmente; non pubblicata**.

## Risolto

- Sostituito il preset Vercel/statico con l'adapter ufficiale TanStack Start per Netlify.
- L'output contiene client, server SSR e la Netlify Function `server.mjs`; non viene più pubblicata soltanto una cartella statica Vercel.
- Verificati SSR, route PWA dinamiche, `/api/auth/*` e una `createServerFn` reale sull'handler Netlify generato.
- Ripristinata la protezione CSRF esplicita per le server function; una chiamata cross-origin viene respinta con `403`.
- Centralizzato e validato il contratto delle environment variable. La convenzione pubblica canonica è `VITE_PUBLIC_HOSTNAME`.
- In runtime Netlify le env obbligatorie mancanti causano un errore esplicito contenente solo i nomi delle variabili, mai i valori.
- Rimossi secret OAuth e fallback preview dal codice corrente. Le credenziali OAuth sono lette solo da env.
- Aggiunto secret scanner locale che non stampa i valori rilevati.
- Rimossa la persistenza del bearer token in `localStorage`; la sessione preview usa `sessionStorage`.
- Rimossa la dipendenza dall'output `.vercel/output` e il vecchio middleware PWA incompatibile.
- Rimosso `// @ts-nocheck` dal motore centrale e corretti gli errori TypeScript preesistenti necessari a stabilizzare la fase.

## File principali modificati

- `vite.config.ts`, `netlify.toml`, `src/start.ts`, `src/server.ts`
- `src/lib/env.shared.ts`, `src/lib/env.public.ts`, `src/lib/env.server.ts`
- `.env.example`, `.gitignore`, `README.md`, `AGENTS.md`
- `src/lib/auth/client.ts`, `src/lib/auth/preview.ts`, `src/lib/auth/server.ts`
- `src/lib/db.ts`, `scripts/migrate.mjs`
- `scripts/netlify-output-smoke.mjs`, `scripts/secret-scan.mjs`
- `scripts/grok-pwa-plugin.test.mjs`, `scripts/grok-pwa-shared.mjs`
- `src/lib/server/agents.ts` e correzioni TypeScript/lint strettamente necessarie

## Verifiche

| Verifica | Risultato |
| --- | --- |
| Typecheck strict | PASS |
| Test repository | PASS — 47/47 |
| Lint | PASS — 0 errori, 11 warning preesistenti |
| Build Netlify full-stack | PASS |
| Smoke SSR/API/server function | PASS |
| CSRF cross-origin | PASS — `403` |
| Secret scan tree corrente | PASS — 163 file tracciati |
| Audit dipendenze runtime (`--omit=dev`) | PASS — 0 vulnerabilità |
| Migrazione locale senza `DATABASE_URL` | PASS — fallback locale dichiarato |

## Ancora aperto / azioni esterne

- **NON RISOLTO ESTERNAMENTE:** la credenziale OAuth precedentemente esposta deve essere revocata e ruotata dal proprietario nel provider. Il valore non viene riportato nei log o in questo documento.
- **NON RISOLTO NELLA STORIA GIT:** la rimozione vale per il tree corrente; una riscrittura della storia è distruttiva e richiede autorizzazione e coordinamento espliciti.
- **NON VERIFICATO SU PREVIEW/PRODUCTION:** nessun deploy è stato eseguito. Il preview resta bloccato finché l'ownership dei build job non è corretta in Fase 2.
- L'adapter ufficiale Netlify `1.3.17` introduce 10 advisory `high` nel solo toolchain di sviluppo, senza fix disponibile nella versione corrente. L'audit runtime è pulito; il debito upstream resta dichiarato.
- Il bundle client include ancora PGLite/`pg` e asset molto grandi. È un problema di boundary/performance da correggere nelle fasi successive, non mascherato come risolto.
- Il controllo CI del secret scan sarà collegato nella Fase 9.

## Env richieste per Netlify

- `DATABASE_URL`
- `XAI_API_KEY`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `VITE_AUTH_ENABLED=true`
- `VITE_PUBLIC_HOSTNAME`
- `GROK_AUTH_CLIENT_ID`
- `GROK_AUTH_CLIENT_SECRET`

Le credenziali Google, Apple, Stripe, Expo/EAS e store non sono inventate né dichiarate configurate. Verranno richieste soltanto dai flussi reali che le utilizzano.

## Breaking change

- `VITE_PUBLIC_ORIGIN` è deprecata e rifiutata nel runtime Netlify; usare `VITE_PUBLIC_HOSTNAME` senza schema o path.
- L'autenticazione è attiva soltanto con `VITE_AUTH_ENABLED=true`; non viene più abilitata implicitamente dalla presenza di un hostname.
