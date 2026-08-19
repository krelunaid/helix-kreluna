# Helix by Kreluna

Software house AI: dall’idea a un prodotto (sito, app, software, programma desktop).

- Live: https://helix.kreluna.it
- Codice completo: ramo [`complete`](https://github.com/krelunaid/helix-kreluna/tree/complete)
- Account: [krelunaid](https://github.com/krelunaid)

`main` era un backup parziale. Il prodotto sta su `complete`.

## Cosa include

- Interfaccia: home, login, dashboard, studio, vetrina, prezzi, go-live
- House: Helix + specialisti (Nova, Atlas, Forge, Cedar, Lumen, Twin, Score…)
- Gems di rifinitura: Sable, Wren, Bramble (collegati al pipeline, non solo etichette)
- Auth Better Auth (Google / Apple / email)
- Preview HTML, Kreluna Score, Council, Digital Twin
- Pack iOS / Android (Expo) e desktop (Electron)
- Crediti, piani, deploy web

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
```

## Stack

TanStack Start, Vite, Better Auth, Neon/PGLite, Grok (xAI).

## Nota

Le foto grandi (`public/helix-orb.png`, `public/templates/*.jpg`) possono mancare in questo ramo se troppo pesanti per l’API GitHub. In locale restano nel workspace Grok.
