# ChipStack ♠ — virtual poker chips

**▶ Play: [pokercomp.vercel.app](https://pokercomp.vercel.app)**

You bring a real deck of cards and ChipStack handles the chips. It's a PWA for in-person
**Texas Hold'em**. Anyone can open it on their phone. There are no accounts: one person creates a
table and the others join with a 5-letter code, a link or a QR code.

## Features

- **No sign-up.** Create a table, share the code or QR, and friends join from their phone browser. It can be installed as an app (PWA).
- **Real betting engine.** It posts the blinds, rotates the dealer button and enforces turn order. It supports check / call / bet / raise / all-in with min-raise rules, short all-ins, **side pots**, split pots and returned uncalled bets.
- **The host runs the table.** The host deals hands, flips the Flop / Turn / River, picks the showdown winner(s), edits stacks (rebuys), sits players out, removes them, changes blinds, acts for a player whose phone died, cancels a hand with refunds, and has **undo**.
- **Optional board cards.** The host can tap a flipped card to record its value for everyone.
- **3D chip stacks and animations.** Chips fly into the pot and back to the winner, cards flip, and synthesized chip sounds and haptics play.
- **Hidden rules drawer.** Pull the gold ♠♥ tab on the screen edge to see hand rankings, how to play, betting rules and terms in **English, French and Arabic (RTL)**.
- **Keep screen awake** while playing (Screen Wake Lock API). It's on by default and you can toggle it in the menu.
- The whole UI is available in EN / FR / AR.

## Stack

- Vite + React + TypeScript, `vite-plugin-pwa`
- One Vercel Function at `api/room.ts`. All game logic lives in `shared/engine.ts` (unit tested) and runs on the server, so clients can't cheat the chip counts.
- Room state lives in **Upstash Redis** and is written with an atomic compare-and-set Lua script. Clients poll once per second, and an unchanged version costs only one Redis read.

## Development

```bash
npm install
npm run dev      # http://localhost:5173 — the API runs in-process with an in-memory store
npm test         # engine unit tests
npm run build
```

## Deploying on Vercel

1. Import the repo in Vercel. The framework preset is Vite, and `vercel.json` already sets the build.
2. Under **Storage**, connect an **Upstash for Redis** database to the project. This adds
   `KV_REST_API_URL` / `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`).
3. Redeploy.

If no Redis is connected, the API falls back to an in-memory store and the app shows a warning
banner. Games are not shared reliably between serverless instances in that mode.

Rooms expire after 24 hours of inactivity.
