# Helix by Kreluna

Software house AI: dall’idea a un prodotto (sito, app, software, programma desktop).

- Live: https://helix.kreluna.it
- Codice: questo repository, ramo **main**
- Account: [krelunaid](https://github.com/krelunaid)

Questo è il codice completo dell’app, non un backup parziale.

## Cosa include

- Interfaccia: home, login, dashboard, studio, vetrina, prezzi, go-live
- Esempi live: `/a/sonar`, `/a/mixlab`, `/a/actstage`
- House: Helix + specialisti
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
