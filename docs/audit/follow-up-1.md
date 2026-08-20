# Audit Helix — Follow-up 1

Data: 2026-08-20

Stato: **cleanup guest e comportamento database indisponibile stabilizzati localmente; esecuzione schedulata Netlify live non verificata**.

## Risolto

- Le pubblicazioni guest scadute non dipendono più soltanto da una futura lettura o pubblicazione per essere rimosse. Una Netlify Scheduled Function esegue il cleanup ogni 15 minuti sui deploy pubblicati.
- Il cleanup è limitato a batch da 250 righe e massimo otto batch per invocazione, compatibile con il limite temporale delle Scheduled Functions. Se restano righe, il log strutturato segnala `reachedRunLimit` senza includere slug, capability o token.
- La selezione usa soltanto `visibility = 'guest'` ed `expires_at <= now()`. Pubblicazioni attive, pubblicazioni pubbliche e deploy con proprietario non vengono cancellati.
- Rimozione di `public_apps` scadute e relativi deploy anonimi avviene in un'unica istruzione PostgreSQL, con batch deterministico e `FOR UPDATE SKIP LOCKED`. Cleanup schedulato e cleanup request-time condividono la stessa implementazione.
- Il test DB crea due guest scaduti, un guest attivo e una pubblicazione pubblica; verifica limite, più passaggi, cancellazioni abbinate e conservazione delle righe fuori scope.
- Una `DATABASE_URL` configurata ma irraggiungibile fallisce senza fallback PGlite. Il pool PostgreSQL applica un timeout di connessione di cinque secondi.
- Il test di database indisponibile usa una porta chiusa, prova sia una query sia l'avvio del worker prima del claim e verifica che il valore sensibile generato a runtime non compaia nell'errore.
- Il valore usato dal test DB viene generato a runtime: non esistono password fixture hardcoded o nuove eccezioni allo scanner.

## File modificati

- `src/lib/server/persistence/guest-publications.ts`
- `src/lib/server/deploy.ts`
- `src/lib/db.ts`
- `netlify/functions/helix-guest-publication-cleanup.mts`
- `scripts/guest-publication-cleanup.test.mjs`
- `scripts/database-unavailable.test.mjs`
- `scripts/netlify-job-functions.test.mjs`
- `scripts/guest-security.test.mjs`
- `README.md`

## Verifiche

| Verifica                                         | Risultato                                                            |
| ------------------------------------------------ | -------------------------------------------------------------------- |
| Typecheck strict                                 | PASS                                                                 |
| Test repository                                  | PASS — 219/219                                                       |
| Test mirati cleanup/DB/Netlify/guest             | PASS — 18/18                                                         |
| Lint                                             | PASS — 0 errori, 5 warning Fast Refresh legacy in `src/lib/i18n.tsx` |
| `npm run build` client + SSR Netlify             | PASS                                                                 |
| Smoke SSR, server function, auth, PWA e flagship | PASS                                                                 |
| Secret scan worktree                             | PASS — 288 file, 0 finding                                           |
| Audit dipendenze production                      | PASS — 0 vulnerabilità                                               |
| `git diff --check`                               | PASS                                                                 |

I warning build già documentati relativi ai moduli Node `pg` nel pass client e a `eval` interno a PGlite restano visibili. Non sono interpretati come prova di performance browser.

## Migration ed env

- Questo follow-up non aggiunge migration database.
- Questo follow-up non aggiunge environment variable.
- La Scheduled Function usa la `DATABASE_URL` già obbligatoria su Netlify e fallisce chiusa se il database non è disponibile.

## NON VERIFICATO / NON RISOLTO

- **NON VERIFICATO — schedule Netlify live:** configurazione, SQL e comportamento sono testati localmente; nessun deploy pubblicato ha ancora dimostrato un'invocazione schedulata reale.
- **NON VERIFICATO — outage Neon reale:** il test usa un endpoint PostgreSQL locale intenzionalmente irraggiungibile. Dimostra fail-closed, assenza di fallback e redazione, non un'interruzione del database production.
- **NON RISOLTO — retention aggiuntiva:** il cleanup elimina le preview guest dopo expiry. Non introduce object storage, retention dei workspace, garbage collection dei job o cancellazione dei log AI.
- Restano invariati gli altri blocchi dell'audit finale: Production multi-file, browser QA reale, provider e pagamenti live, store, monitoring, hosted CI e secret storico.

## Comportamento operativo cambiato

- Una connessione PostgreSQL non stabilita entro cinque secondi fallisce invece di attendere senza limite.
- Le preview guest scadute e i loro deploy anonimi vengono eliminati automaticamente a batch sui deploy Netlify pubblicati.

Nessun commit, push, deploy, migration su database esterno, richiesta xAI, pagamento, store upload o browser test è stato eseguito in questo follow-up.
