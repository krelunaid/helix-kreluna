# Helix by Kreluna

Software house AI: dall’idea a un prodotto (sito, app, software, programma desktop).

- Live: https://helix.kreluna.it
- Codice: questo repository, ramo **main**
- Account: [krelunaid](https://github.com/krelunaid)

Questo è il codice completo dell’app, non un backup parziale.

## Cosa include

- Interfaccia: home, login, dashboard, studio, vetrina, prezzi, go-live
- Sei flagship localizzate: Orbit Command, Neura, Synapse, Vanta, Arc City e Morph; le demo precedenti restano archiviate
- House: Helix + specialisti
- Auth Better Auth (email e broker OAuth Google/X)
- Preview HTML isolata, Kreluna Score euristico e Automated Council Score
- Runner browser separato per Twin/Echo/Swift; se Chromium non è disponibile il report è `not_run`
- Preparazione sorgenti Expo/Electron; nessun build firmato o upload agli store viene simulato
- Crediti atomici; i piani a pagamento restano disabilitati finché Stripe non è configurato
- Release web interna Kreluna solo dopo Human Gate e report Aegis misurato
- Unico gateway AI provider-neutral: ogni chiamata xAI prenota prima un budget persistente e registra modello, token, cache, latenza, hash del risultato e costo provider effettivo quando disponibile
- Prototype e Production sono livelli distinti: il Prototype HTML è disponibile; Production resta fail-closed finché non esiste una pipeline multi-file compilata e testata
- candidate, adapter firmato e core provider-neutral del runner workspace Production sono definiti; nessun provider sandbox è collegato o distribuito e Production resta disabilitata

## Avvio

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Preview: `http://localhost:8080`

```bash
npm run typecheck
npm test
npm run build
npm run security:secrets
```

`npm run build` crea soltanto l'artefatto client/SSR e non modifica database.
Le migration PostgreSQL locali sono un'operazione esplicita: `npm run db:migrate`.

## QA misurata

Twin, Echo e Swift usano un runner Playwright/Chromium separato dal bundle SSR.
Il runner applica lo stesso sandbox/CSP della preview, blocca richieste esterne,
prova desktop e telefono e scrive tre report legati all'hash dell'artefatto.
Se il pacchetto o il browser non sono disponibili non inventa risultati:
scrive `not_run`.

```bash
npm run qa:twin -- --input ./artifact.html --output ./artifacts/twin/report.json --require-browser
```

Storm non invia traffico senza autorizzazione esplicita ed è limitato per
richieste, concorrenza, durata e timeout. I target non locali richiedono una
allowlist di origine esatta.

```bash
npm run qa:storm -- --confirm-load-test --target http://127.0.0.1:8080/ --requests 20 --concurrency 2
```

Lo scan CI del worktree e lo scan completo della history usano gli stessi
detector robusti e non stampano mai i valori trovati. La modalità worktree
controlla anche i file untracked e non accetta allowlist:

```bash
npm run security:history
```

La vecchia credenziale preview è ancora raggiungibile nella storia Git: lo scan
resta bloccante finché la rotazione esterna non è confermata e la history non
viene riscritta in modo coordinato oppure il solo fingerprint storico non viene
documentato esplicitamente come revocato.

## Telemetria e budget AI

Tutte le esecuzioni model-backed (Nova, Atlas, Lumen, Forge, Gemme, Iris e
Superior) passano dallo stesso gateway. Il database riserva atomicamente il
tetto della chiamata prima del traffico provider e applica per job un massimo di
16 chiamate, 2 retry model-level, 10 minuti e 9 USD di costo contabilizzato.
Il costo usa tick interi (`1 USD = 10^10 tick`): `provider_actual` proviene da
`usage.cost_in_usd_ticks`; se il provider non restituisce la misura, il costo
effettivo resta sconosciuto e il budget contabilizza conservativamente la
prenotazione massima. Prompt, risposte e chiavi API non sono salvati nella
telemetria; restano soltanto hash SHA-256 e metadati tecnici.

## Stack

TanStack Start, Vite, Netlify Functions, Better Auth, Neon/PGLite, Grok (xAI).

## Configurazione

In locale `VITE_AUTH_ENABLED=false` usa il solo utente di sviluppo e PGLite.
Su Netlify Helix non degrada a dati in memoria o output AI finti: sono richieste
`DATABASE_URL`, `XAI_API_KEY`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
`VITE_AUTH_ENABLED=true`, `VITE_PUBLIC_HOSTNAME` e la coppia
`GROK_AUTH_CLIENT_ID` / `GROK_AUTH_CLIENT_SECRET`.

`VITE_PUBLIC_HOSTNAME` è l’unica convenzione pubblica per l’host e non contiene
schema o percorso (esempio: `helix.kreluna.it`). Le credenziali OAuth upstream
Google/X restano nel broker; Helix non usa variabili `GOOGLE_*` o `APPLE_*`.
`GUEST_RATE_LIMIT_SALT` è opzionale e consente di separare la pseudonimizzazione
delle quote guest dal secret di sessione; se manca su Netlify viene usato
`BETTER_AUTH_SECRET` senza esporre né registrare l'indirizzo IP in chiaro.

La credenziale preview precedentemente presente nel sorgente deve essere
revocata e ruotata sul provider esterno. Rimuoverla dal branch corrente non la
elimina automaticamente dalla storia Git.

## Deploy Netlify

Il plugin ufficiale TanStack Start per Netlify genera il client in `dist/client`,
il server SSR in `dist/server` e l’entry Function in
`.netlify/v1/functions/server.mjs`. CI, deploy preview e branch deploy eseguono
il build non mutativo. Solo un build avviato da Netlify nel contesto
`production` seleziona `build:netlify:production`, che compila prima e applica
poi le migration con guardie fail-closed su contesto e `DATABASE_URL`. La CI non
pubblica né migra database.

Le preview guest scadono dopo 24 ore. Una Scheduled Function le elimina dal
database ogni 15 minuti in batch limitati, insieme ai soli deploy anonimi
collegati; pubblicazioni pubbliche e guest ancora attivi restano intatti.
