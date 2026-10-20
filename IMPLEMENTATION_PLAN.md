# Implementation Plan — Rotaray (train board game companion, Europe map)

> App name: **Rotaray**. The public name must **not** include "Ticket to Ride" (trademark of Days of Wonder).

## 1. Goals

### Version 1 (this plan)
A personal, single-device **web app (PWA)** that each player uses on their own phone during a game:

- Interactive map of Europe with all cities and routes
- Tap a route to mark it as claimed by **me** or by an **opponent (with their color)**
- Rotate the map 180° (for sitting on the other side of the table), zoom, pan
- Automatic score, trains-left and stations tracking
- Undo, and a saved game that survives closing the browser
- Installable on the home screen, works offline

### Later versions (designed for now, built later)
- **v2 — Ticket chooser:** evaluate starting tickets and recommend which to keep
- **v3 — Strategy builder:** plan a network for all my tickets, re-plan when routes get blocked
- **v4 — Real-time multiplayer:** one player creates a game session, others join it (link / QR code), and claims are synced live

The key design decision: **v1 is built so that v4 does not require a rewrite** (see §4).

---

## 2. Tech stack

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript | Safe data model (routes, actions), easier refactoring |
| Build tool | Vite | Fast, simple, first-class PWA plugin |
| UI | React 18 | Large ecosystem, easy to move to React Native later if needed |
| State | Zustand + pure reducer | Small; the reducer is reusable on a future server |
| Map rendering | Inline SVG (React components) | Sharp at any zoom, easy tap targets, CSS theming |
| Pan / zoom | Custom pointer-event handling + CSS transform | Pinch-zoom, drag, tap and long-press in one place (`@use-gesture` was dropped) |
| Storage | IndexedDB via `idb-keyval` | Reliable offline storage of the action log |
| PWA | `vite-plugin-pwa` (Workbox) | Manifest, service worker, offline cache |
| Unit tests | Vitest | Reducer, scoring, map-data validation |
| E2E tests | Playwright (mobile viewport) | Claim / undo / rotate / reload flows |
| Hosting | Cloudflare Pages or Netlify | Free static hosting, HTTPS (required for PWA) |

No backend in v1.

---

## 3. Map data

### 3.1 Data model

```ts
type CityId = string;            // "paris", "wien", "kobenhavn"

interface City {
  id: CityId;
  name: string;                  // display name as used on the game map, e.g. "København"
  lat: number;                   // real-world coordinates
  lon: number;
  labelOffset?: { dx: number; dy: number };   // manual tweak for readability
}

type RouteColor =
  | "red" | "orange" | "yellow" | "green" | "blue"
  | "purple" | "white" | "black" | "gray";

interface Route {
  id: string;                    // "paris-bruxelles-a" (stable, used in saved games & network sync)
  from: CityId;
  to: CityId;
  length: 1 | 2 | 3 | 4 | 6 | 8;
  color: RouteColor;
  tunnel: boolean;
  ferryLocomotives: number;      // 0 = not a ferry
  doubleOf?: string;             // id of the parallel route, if this is a double route
  path?: [number, number][];     // optional bend points so routes don't overlap
}
```

### 3.2 Our own map design (needed for a public release)
- City positions come from **real latitude/longitude**, projected onto the screen (a simple equirectangular or Lambert projection), then hand-adjusted where cities are too close together.
- Original visual style: our own colors, fonts, train-car shapes, background. No scans, tracings or artwork from the official board.
- Route **connections** (which cities connect, length, color, tunnel/ferry) are entered by hand from the game.

### 3.3 Data validation (automated tests)
Hand-entered data will have typos, so tests must check:
- Every route's `from` / `to` exists in the city list
- Every city has at least one route
- `doubleOf` references are symmetric
- The totals match the real game: number of cities, number of routes, tunnel count, ferry count, total train-car spaces
- The graph is connected (every city reachable from every other)

---

## 4. Architecture: event-sourced game state

Instead of storing "the current state", the app stores a **list of actions** and computes the state from them.

```
actions[]  ──►  reducer(state, action)  ──►  GameState  ──►  UI
```

### 4.1 Actions (v1)

```ts
type Action =
  | { type: "GAME_CREATED"; gameId: string; playerCount: number; at: number }
  | { type: "PLAYER_ADDED"; playerId: string; name: string; color: PlayerColor; isMe: boolean }
  | { type: "ROUTE_CLAIMED"; routeId: string; playerId: string }
  | { type: "ROUTE_UNCLAIMED"; routeId: string }
  | { type: "STATION_PLACED"; cityId: CityId; playerId: string }
  | { type: "STATION_REMOVED"; cityId: CityId; playerId: string }
  | { type: "GAME_ENDED" };
```

Every action also carries `id` (UUID), `actorId` (who did it) and `at` (timestamp).

### 4.2 Why this matters
| Benefit | v1 | v4 multiplayer |
|---|---|---|
| **Undo** | Remove the last action, recompute | Same, server-validated |
| **Saving** | Persist the action list to IndexedDB | The server stores the same list |
| **Sync** | — | Broadcast actions over WebSocket; every phone runs the same reducer |
| **Validation** | Reducer rejects illegal actions (route already taken, no trains left) | The **same reducer code** runs on the server as the authority |

### 4.3 Public vs private state
Already separated in v1 so multiplayer is safe later:
- **Public:** players, claimed routes, stations, train counts, public score
- **Private (per player, never sent to others):** tickets, ticket chooser results, strategy plans

### 4.4 Sync adapter interface
```ts
interface SyncAdapter {
  dispatch(action: Action): Promise<void>;
  subscribe(onAction: (a: Action) => void): () => void;
  load(gameId: string): Promise<Action[]>;
}
```
- v1: `LocalAdapter` (IndexedDB only)
- v4: `RealtimeAdapter` (WebSocket) — UI code does not change

---

## 5. Game rules implemented in v1

| Rule | Implementation |
|---|---|
| Route points: length 1/2/3/4/6/8 → 1/2/4/7/15/21 | Pure function, unit tested |
| 45 trains per player | Trains left = 45 − sum of claimed route lengths |
| End-game trigger: a player has ≤ 2 trains | Banner: "Last round!" — works for opponents too, since we track their routes |
| 3 stations per player, unused = 4 points each | Station counter, final score |
| Double routes: in 2–3 player games only one of the pair can be used | Second route of the pair is disabled when the first is claimed |
| Same player cannot claim both routes of a double | Reducer rejects it |
| A city can hold only one station (real rule; stricter than "one per player") | Reducer rejects it |
| European Express (+10, longest continuous path) | **Shown at the end**, calculated with a longest-trail search on each player's routes |
| Ticket points | Not in v1 (tickets arrive in v2); manual "+/− ticket points" entry at game end |

Score panel shows: **my score** in detail, plus the **route score and trains left** for each opponent.

This is allowed by the game rules: route points are scored openly on the board's score track the moment a route is claimed, and everyone can count the trains on the board. Only destination tickets are secret, so ticket points are never estimated for opponents.

---

## 6. Screens and interactions

### 6.1 New game
1. Number of players (2–5)
2. For each player: name (optional) and color (the 5 train colors of the game)
3. Choose which player is **me**
4. Start → map screen

### 6.2 Map screen (main screen)
- Full-screen SVG map
- **Tap a route** → small picker with the player colors + "Free" (unclaim). My color is first.
- **Long-press a city** → place / remove a station
- Claimed routes are drawn in the player's color; free routes in their route color
- Tunnels have a dashed outline, ferries show locomotive icons
- **Toolbar:** Rotate 180°, Undo, Score, Menu
- Pinch to zoom, drag to pan, double-tap to reset view
- Route tap targets at least 44×44 px; at low zoom, nearby routes are disambiguated by a small list

### 6.3 Score sheet (bottom sheet)
- Me: route points, trains left, stations left, total
- Opponents: color, trains left, estimated route points
- "Last round" warning

### 6.4 End game
- Enter my ticket results (completed / failed points)
- European Express winner (auto-calculated, can be overridden)
- Final scores

### 6.5 Game history
- Home screen lists **active and finished games** (date, players, colors, final scores, winner)
- Tap a finished game → final map and score breakdown (read-only)
- Resume an unfinished game, or delete a game (with confirmation)
- Simple personal stats: games played, wins, average score, favorite color
- Export / import all games as a JSON file (backup, moving to a new phone)

### 6.6 Languages (English + Turkish)
- All UI text in translation files: `src/i18n/en.json`, `src/i18n/tr.json`
- Library: `i18next` + `react-i18next` (handles plurals, e.g. "1 train" / "2 trains")
- Default language from the phone's settings, can be changed in the menu
- **City names stay as on the game map** (e.g. "København", "Wien", "Constantinople") in both languages, so players can match the board
- Tests check that both files have the same keys (no missing translations)

### 6.7 Accessibility
- Route colors are critical, so add **color-blind support**: a pattern or letter on each route color, and on each player color
- Large text option, dark mode
- Screen stays awake during a game (Wake Lock API)

---

## 7. Project structure

```
src/
  data/
    cities.ts            // City[]
    routes.ts            // Route[]
    projection.ts        // lat/lon → SVG x/y
  game/
    actions.ts           // Action types
    reducer.ts           // pure, no browser APIs (reusable on server)
    selectors.ts         // score, trains left, end-game check
    scoring.ts           // route points, longest trail
    rules.ts             // double routes, station limits
  sync/
    SyncAdapter.ts
    LocalAdapter.ts      // IndexedDB
  history/
    gameIndex.ts         // list of saved games (summary per game)
    exportImport.ts      // JSON backup
  i18n/
    index.ts
    en.json
    tr.json
  store/
    gameStore.ts         // Zustand, wires adapter + reducer
  ui/
    map/                 // MapView, RouteShape, CityNode, ClaimPicker
    screens/             // NewGame, MapScreen, EndGame
    components/          // ScoreSheet, Toolbar
  pwa/
tests/
  data.test.ts           // map data validation
  reducer.test.ts
  scoring.test.ts
e2e/
  game-flow.spec.ts
```

`src/game/` must stay free of React and browser APIs, so it can be shared with the future server.

---

## 8. Milestones

| # | Milestone | Done when |
|---|---|---|
| 0 | **Project setup** | Vite + React + TS + Vitest + Playwright + lint run; deploys to a preview URL |
| 1 | **Map data** | All cities and routes entered; validation tests pass with the real game totals |
| 2 | **Map rendering** | Map draws correctly on a phone; rotate, zoom, pan work |
| 3 | **Game core** | Reducer, actions, rules, scoring with unit tests (aim for ~100% on `game/`) |
| 4 | **Game flow UI** | New game → claim routes (with colors) → stations → undo → score sheet |
| 5 | **Persistence + PWA** | Reload keeps the game; installable; works in airplane mode |
| 6 | **End game + history** | European Express, final score, game history list, stats, JSON export/import |
| 6b | **Languages + polish** | English + Turkish complete, color-blind mode, dark mode, wake lock |
| 7 | **Release v1** | Tested on real iPhone (Safari) and Android (Chrome); public URL |

Milestone 1 (data entry and checking) is the most error-prone part. I can enter the data, but you should **check it against your physical board**.

---

## 9. Testing

- **Unit:** reducer (every action, illegal actions rejected), scoring table, longest trail, double-route rules, data validation
- **E2E (mobile viewport):** full game flow, undo, rotate, reload restores game, offline mode
- **Manual:** real devices; play one real game with the app

---

## 10. Roadmap after v1

### v2 — Ticket chooser
- Add my tickets (pick from the list of real tickets)
- Shortest paths (Dijkstra, weight = route length, with penalties for tunnels/ferries)
- Score each combination of tickets: points per train, route overlap, total trains needed, risk at busy hubs
- Recommend which tickets to keep and explain why

### v3 — Strategy builder
- Combine all my tickets into one network (Steiner-tree approximation)
- Show card colors needed and the order to claim routes
- When an opponent claims a planned route: suggest an alternative path or a station

### v4 — Real-time multiplayer
- **Backend options:** PartyKit / Cloudflare Durable Objects (one room per game, WebSocket) — or Supabase Realtime
- Host creates a session → gets a **join code + QR code** → others join from their phones
- Server runs the shared `game/reducer.ts` as the authority (solves two players claiming the same route at the same time)
- Only public actions are synced; tickets and plans stay on each phone
- Reconnect: client reloads the action list from the server
- Optional anonymous login (no accounts needed for casual play)

---

## 11. Legal checklist for a public release
*(Not legal advice. Consider asking a professional before publishing.)*
- Own app name and logo, no "Ticket to Ride" or Days of Wonder branding
- Own map artwork (real geography + own style), no copied board art
- Don't copy rulebook text; write our own short explanations
- Add a clear note: "Unofficial fan-made companion app, not affiliated with Days of Wonder"

---

## 12. Decisions
| Question | Decision |
|---|---|
| App name | **Rotaray** — check App Store, Google Play and domain availability before release |
| Languages | English + Turkish |
| Opponent info | Show both route score and trains left (allowed by the rules) |
| Game history | Yes — list of past games, stats, JSON export/import |

---

## 13. Implementation status

| # | Milestone | Status |
|---|---|---|
| 0 | Project setup | Done (preview URL: deploy `dist/` manually, no CI by choice) |
| 1 | Map data | Done — **still to verify against the physical board** |
| 2 | Map rendering | Done (rotate, pinch/wheel zoom, pan, double-tap reset, 44px tap targets) |
| 3 | Game core | Done (unit tests for reducer, rules, scoring) |
| 4 | Game flow UI | Done |
| 5 | Persistence + PWA | Done (IndexedDB, installable, offline e2e test) |
| 6 | End game + history | Done (European Express, tickets, stats, JSON export/import) |
| 6b | Languages + polish | Done (EN/TR, color-blind mode, dark mode, large text, wake lock) |
| 7 | Release v1 | Open: test on a real iPhone and Android, pick the public host, check the name "Rotaray" |
