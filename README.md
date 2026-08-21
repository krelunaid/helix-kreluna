# Helix by Kreluna

Software house AI: dall’idea a un prodotto (sito, app, software, programma desktop).

- Live: https://helix.kreluna.it
- Codice: questo repository, ramo **main**
- Account: [krelunaid](https://github.com/krelunaid)

Questo è il codice completo dell’app, non un backup parziale.

Stato verificato al 2026-08-21: il commit Terra
`dd15f6842e872b56a176bf4869138ab7af909965` è pubblicato con CI e CodeQL verdi,
ma non è deployato. Il successivo hardening preview/tester è ancora locale; non
ha eseguito chiamate Terra, transazioni Stripe, migrazioni remote o deploy.

## Cosa include

- Interfaccia: home, login, dashboard, studio, vetrina, prezzi, go-live
- Sei flagship localizzate: Orbit Command, Neura, Synapse, Vanta, Arc City e Morph; le demo precedenti restano archiviate
- House: Helix + specialisti
- Auth Better Auth; nelle preview di test l'account è pre-provisionato, senza signup pubblico, mentre il broker OAuth Google/X resta opzionale
- Preview HTML isolata, Kreluna Score euristico e Automated Council Score
- Runner browser separato per Twin/Echo/Swift; se Chromium non è disponibile il report è `not_run`
- Preparazione sorgenti Expo/Electron; nessun build firmato o upload agli store viene simulato
- Crediti atomici; i piani a pagamento restano disabilitati finché Stripe non è configurato e il grant gratuito di preview è un'operazione singola da 10 crediti, eseguibile soltanto dall'operatore
- Release web interna Kreluna solo dopo Human Gate e report Aegis misurato
- Unico gateway AI provider-neutral: ogni chiamata a OpenAI `gpt-5.6-terra` tramite Netlify AI Gateway prenota prima un budget persistente e registra modello, token, cache, latenza, hash del risultato e costo effettivo solo quando esiste evidence autorevole
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
Il costo usa tick interi (`1 USD = 10^10 tick`): `provider_actual` è accettato
solo da evidence di costo autorevole. Netlify AI Gateway/OpenAI non restituisce
questa misura nella risposta usata da Helix, quindi il costo effettivo resta
sconosciuto e il budget contabilizza conservativamente la prenotazione massima.
Prompt, risposte e chiavi API non sono salvati nella telemetria; restano soltanto
hash SHA-256 e metadati tecnici.

## Stack

TanStack Start, Vite, Netlify Functions, Better Auth, Neon/PGLite, OpenAI
`gpt-5.6-terra` tramite Netlify AI Gateway. Il broker Grok resta separato ed è
usato soltanto per OAuth Google/X, non per la generazione.

## Configurazione

In locale `VITE_AUTH_ENABLED=false` usa il solo utente di sviluppo e PGLite.
Su Netlify Helix non degrada a dati in memoria o output AI finti: sono richieste
la connessione Netlify Database, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
`VITE_AUTH_ENABLED=true` e `VITE_PUBLIC_HOSTNAME`. Il broker è separato:
`VITE_GROK_AUTH_ENABLED=true` richiede insieme `GROK_AUTH_CLIENT_ID` e
`GROK_AUTH_CLIENT_SECRET`; credenziali parziali o presenti con lo switch spento
falliscono chiuse. La preview tester non espone signup o endpoint di grant.

Le chiamate AI sono disabilitate per default con
`HELIX_AI_GATEWAY_ENABLED=false`. Per abilitarle il runtime server deve ricevere
insieme `NETLIFY_AI_GATEWAY_KEY` e `NETLIFY_AI_GATEWAY_BASE_URL`, iniettati a
runtime per Netlify AI Gateway; non sono variabili browser e non sostituiscono
le credenziali del broker OAuth. Se lo switch o la coppia mancano, la
generazione fallisce chiusa senza traffico provider.

`VITE_PUBLIC_HOSTNAME` è l’unica convenzione pubblica per l’host e non contiene
schema o percorso (esempio: `helix.kreluna.it`). Le credenziali OAuth upstream
Google/X restano nel broker; Helix non usa variabili `GOOGLE_*` o `APPLE_*`.
`GUEST_RATE_LIMIT_SALT` è opzionale e consente di separare la pseudonimizzazione
delle quote guest dal secret di sessione; se manca su Netlify viene usato
`BETTER_AUTH_SECRET` senza esporre né registrare l'indirizzo IP in chiaro.

La credenziale preview precedentemente presente nel sorgente deve essere
revocata e ruotata sul provider esterno. Rimuoverla dal branch corrente non la
elimina automaticamente dalla storia Git.

## Tester e crediti della deploy preview

Il diff preview-only corrente non è deployato. Il grant è vincolato a un solo
account Better Auth già esistente, identificato contemporaneamente da user ID
immutabile ed email attesa. Un operatore può accreditare una sola volta **10
crediti** tramite uno script server-only con conferma esplicita; il movimento è
atomico e idempotente nel ledger. Non esistono endpoint applicativi o signup che
possano attivarlo.

Il comando accetta soltanto una vera pull-request preview Netlify con database
isolato attestato. Production, branch deploy, contesti ambigui e Stripe attivo
falliscono chiusi. In questo snapshot Stripe resta spento e non sono state
eseguite chiamate Terra, migrazioni remote o operazioni Netlify.

## Deploy Netlify

Il plugin ufficiale TanStack Start per Netlify genera il client in `dist/client`,
il server SSR in `dist/server` e l’entry Function in
`.netlify/v1/functions/server.mjs`. CI, deploy preview e branch deploy eseguono
il build non mutativo. Una migration di preview richiede una procedura separata
e l'attestazione esatta del branch database e dell'hash dell'URL autorevole;
senza entrambe il percorso resta non mutativo. Solo un build avviato da Netlify
nel contesto `production` seleziona `build:netlify:production`, che compila
prima e applica poi le migration con guardie fail-closed su contesto e
`DATABASE_URL`. La CI non pubblica né migra database.

Le preview guest scadono dopo 24 ore. Una Scheduled Function le elimina dal
database ogni 15 minuti in batch limitati, insieme ai soli deploy anonimi
collegati; pubblicazioni pubbliche e guest ancora attivi restano intatti.
