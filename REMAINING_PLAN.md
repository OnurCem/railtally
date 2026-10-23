# Remaining work — plan and recommended order

Status of v1: all milestones of `IMPLEMENTATION_PLAN.md` are built except **Milestone 7 (release)**. This plan covers
what is left, in the order I recommend. "You" = needs the owner; "Me" = can be done in a coding session.

> **Progress (2026-10-20):** steps 1–5 are done (data verified against the board, phone polish, GitHub Pages, device
> tests on a Galaxy S24+ and an iPhone simulator, MIT license and privacy notes). Step 6 core is built (see below);
> camera scanning of ticket cards is the next addition.

## Recommended order

| # | Step | Who | Effort | Why in this position |
|---|---|---|---|---|
| 1 | Data check screen + verify route/ticket data against the board | Me, then You | 1 h + 30 min | Every later feature (tickets, scoring) trusts this data. Cheap to do, expensive to find out late. |
| 2 | Phone polish (start zoom, fit button, back button, claimed marks) | Me | 1–2 h | Makes real-device testing meaningful. |
| 3 | Deploy to GitHub Pages | Me (+ You approve enabling Pages) | 1 h | Gives an HTTPS URL, which is needed to test install and offline on phones. |
| 4 | Real-device test pass, fix findings | You, then Me | 1 h + fixes | Finds what desktop emulation cannot. |
| 5 | Release gate (trademark, domain, license, legal decisions) | You | 1–2 h | Must be done before the link is shared widely. |
| 6 | v2 Ticket chooser | Me | 4–6 h | First feature that needs the verified data from step 1. |
| 7 | v3 Strategy builder | Me | 1–2 days | Builds on v2's path-finding. |
| 8 | v4 Real-time multiplayer | Me + You (backend account) | several days | Client built; server waits for your Cloudflare account. |

Steps 1–5 can finish in a few days. Steps 6–8 are separate projects; re-plan before starting each.

---

## 1. Data check screen, then verify the data

**Problem:** the 101 routes and 46 tickets were typed by hand. The automated tests only prove the totals and
internal consistency (47 cities, 300 train spaces, every city reachable), not that each route is right.

**Build (me)**
- A hidden "Data check" screen (open with `/#data` or a link in Settings) that lists every city with its routes:
  neighbour, length, color, tunnel/ferry marks, double route. It is meant to be read next to the physical board.
- A second list for the tickets: from, to, points, long/short.
- Print-friendly CSS so it can be checked on paper.

**Verify (you)**
- Go city by city and tick off the routes. Check the 6 long tickets and the 40 short ones.
- Report mistakes; I fix `railtally-data/*.csv`, regenerate with `node railtally-data/build-and-validate.mjs`, and the tests re-check totals.

**Done when:** you confirm the list matches the board.

---

## 2. Phone polish

- **Start view:** on a portrait phone the map starts small. Start zoomed to fit the map's height and centered; add a
  "Fit map" button next to Rotate. Keep double-tap reset.
- **Back button:** on Android the system back button leaves the app. Use the History API so back goes
  summary → map → home (a state per screen, no routing library).
- **Claimed marks:** draw the owner's initial or pattern on claimed routes at high zoom, so crowded areas are readable.
- **Tap feedback:** brief highlight on the route under the finger.
- Add e2e tests for each (viewport size, back button).

**Done when:** a full game feels comfortable on a 375 px wide phone without first pinching.

---

## 3. Hosting on GitHub Pages

**Can we use it? Yes.** Constraints and decisions:

- **URL and base path.** A project site lives at `https://onurcem.github.io/railtally/`, not at `/`. The app currently
  assumes `/`. Change: `base: process.env.BASE_PATH ?? "/"` in `vite.config.ts`; build with `BASE_PATH=/railtally/`.
  The PWA plugin derives `start_url` and `scope` from the base. The Playwright config needs the same base.
  A custom domain later (for example `railtally.com`) uses base `/` plus a `CNAME` file.
- **Deploy without a workflow of our own.** A script `scripts/deploy-pages.sh` builds the app and pushes `dist/`
  (plus `.nojekyll`) to a `gh-pages` branch. Pages is enabled once with
  `gh api -X POST repos/OnurCem/railtally/pages -f 'source[branch]=gh-pages' -f 'source[path]=/'`.
  No `.github/workflows` file is added.
- **Cost.** The repository is public, and GitHub-hosted runners are free for public repositories. Publishing a branch
  still triggers GitHub's built-in "pages build and deployment" run (a few seconds). If you want **zero** GitHub runs,
  use Cloudflare Pages or Netlify with a direct upload instead; the base path then stays `/`.
- **It is public.** A Pages URL is a public site. See step 5 for the legal gate before sharing the link.
- **Updates.** The service worker auto-updates; a new deploy reaches phones on their next online visit.
- **Limits.** 1 GB site size and about 100 GB/month bandwidth are far above our ~260 KB.

**Done when:** the Pages URL loads, the install prompt appears, and airplane mode works after the first visit.

---

## 4. Real-device test pass

Checklist (iPhone Safari + one Android Chrome):
1. Install to the home screen; icon and name correct.
2. Full game: 3 players, claim 10+ routes, stations, undo, rotate, score sheet, end game, history.
3. Gestures: pinch, pan, long-press on a city, double-tap reset, no accidental page scroll or pull-to-refresh.
4. Screen stays awake during a game; airplane mode still works.
5. Turkish language, dark mode, large text, color-blind patterns.
6. Rotate the phone to landscape.
7. Export a backup and import it back (iOS file picker behaves differently).

Send findings as a list; I fix them in one batch and extend the e2e tests where possible.

---

## 5. Release gate (you)

- Trademark searches for "Railtally": EUIPO/TMview, USPTO, Türk Patent (classes 9 and 28). Register the domain.
- Choose a **license** for the code (for example MIT). A public repo with no license is "all rights reserved".
  The game data (routes, tickets) is not ours, so state that in the README.
- Decide how public to be: repository only, a link shared with friends, or a store listing.
  Re-read the legal notes: the route and ticket data is the game's content; the layout and style are our own.
- Privacy note: the app stores everything on the device and sends nothing. Say so in the README (and in an in-app
  "About" if you publish).
- Optional: ask Asmodee/Days of Wonder for permission before any wider release or store listing.

---

## 6. v2 — Ticket chooser (private to each player)

**Rules from the Turkish rule sheet.** At the start each player gets 1 long + 3 regular tickets and keeps at least 2
(discards go back to the box). During the game a ticket action draws 3 regular tickets: keep at least 1, the rest go to
the bottom of the pile. A completed ticket adds its points, an incomplete one subtracts them. Stations let you borrow one
opponent route each (modelled: `pathCandidates`, `assignStations`).

**Built:** `src/game/paths.ts` (Dijkstra with blocked routes, free own routes, tunnel/ferry penalties),
`src/game/tickets.ts` (success estimate, option ranking, explanations), `TicketsSheet` (Menu → My tickets).
**Stations:** each of my stations (existing or new, up to 3 in total) can use one opponent route at its city; a new
station costs the 4 end-game points. The planner picks borrowed routes per ticket and checks one station per route.
**Skipped for now:** camera scanning of ticket cards.

Original plan:

1. **Ticket picker UI:** choose my tickets from the list (search by city); stored as a *private* action
   (`TICKET_ADDED`/`TICKET_REMOVED`, listed in `PRIVATE_ACTIONS` so v4 never syncs them).
2. **Graph and paths:** build the route graph from the data; Dijkstra shortest path per ticket, weight = route length,
   with small penalties for tunnels and ferries; respect routes already claimed by opponents (blocked) and mine (free).
3. **Evaluation:** for each ticket and for each combination of tickets: trains needed, points per train, overlap
   between paths (shared routes count once), and risk (routes through crowded hubs, few alternatives).
4. **Recommendation:** rank the combinations that keep at least the required number of tickets; explain each pick in
   one or two sentences (English and Turkish).
5. **Tests:** known small cases by hand, plus property tests (overlap never increases total cost, blocked routes avoided).
6. **Where:** `src/game` stays free of browser code; the path logic goes in `src/game/paths.ts` and `src/game/tickets.ts`.

**Done when:** for a hand-picked set of 3–5 tickets the app's recommendation matches what an experienced player picks.

---

## 7. v3 — Strategy builder (done)

**Built:** `src/game/strategy.ts` (`planStrategy`, `diffPlans`), `src/store/planStore.ts` (previous plan in memory only), `StrategySheet` (Menu → Strategy), a dashed map overlay (Menu → Show plan on map) and a train-budget factor in the ticket score (`trainPressure`). It is a heuristic: it reuses the per-ticket cheapest paths and station borrowing, not a full Steiner-tree optimum.

- Combine my tickets into one network (Steiner-tree approximation), list the routes to claim, and the card colors
  needed with a suggested claim order (scarce and contested routes first).
- Re-plan automatically when an opponent claims a planned route: alternative path, or suggest a station.
- Show the plan as an overlay on the map (my planned routes in a dashed outline).
- Reuses v2's graph and path code; adds a planner module and a plan screen.

---

## 8. v4 — Real-time multiplayer (client built, server not deployed)

**Design (decided):**
- **Backend:** one Cloudflare Worker with a Durable Object per game code (`server/worker.ts`, SQLite-backed, free plan).
  Chosen because the shared reducer runs unchanged on it (the server is the authority, as the plan wanted), and a
  WebSocket room is a natural fit. Supabase would mean rules in SQL or trusting clients; PartyKit is the same idea with
  one more vendor. The authority logic is a plain class, `src/sync/room.ts`, tested without any network.
- **Sync model:** the server keeps an append-only log of *public* actions with a server-assigned `seq`. Clients apply
  their own actions at once (optimistic, "pending"), send them, and replace them by the server's order when it arrives.
  Action ids make resending safe (duplicates are ignored). Two players claiming one route: the first to arrive wins, the
  other client gets a "rejected" message, drops its pending action and shows a notice.
- **Undo:** becomes a *revocation* entry (the log is never rewritten). The server accepts it only if the rest of the log
  still replays legally; setup actions (game, players) cannot be revoked. Undo takes back the player's own newest action.
  Re-opening a finished game revokes `GAME_ENDED` (anybody can).
- **Private actions** (`PRIVATE_ACTIONS`, now also `SEAT_TAKEN` = "which player am I on this phone") are stored on the
  device only, anchored after the public action they followed; the server also refuses them.
- **Offline:** everything keeps working; pending actions are saved in IndexedDB (`sync:<gameId>`) and resent on
  reconnect, which first asks for the entries it missed (`hello since=seq`).
- **Joining:** the host gets a 6-character code (no look-alike letters) and a link `…/#join=CODE`; a joiner enters the
  code or opens the link, sees who is in, and either takes an existing seat (also how to return on a new phone) or adds
  a new player.
- **Files:** `src/sync/{protocol,room,merge,RemoteAdapter,transport,memoryTransport,webSocketTransport,config}.ts`,
  `server/`, UI in NewGame ("Together"), `JoinGame`, `ShareSheet`, a status banner on the map.
- **Tests:** `tests/sync.test.ts` (room, merge, two adapters on an in-memory server: convergence, races, offline,
  duplicates, undo, persistence), `tests/sharedStore.test.ts`, `e2e/shared-game.spec.ts`.

**Needs from you (not done, nothing created yet):**
1. A free Cloudflare account, then `cd server && npx wrangler login && npx wrangler deploy` (see `server/README.md`).
2. Tell the app the address: `VITE_SYNC_URL=wss://… npm run build`, or for a quick test
   `localStorage.setItem("railtally:syncUrl", "wss://…")` on a phone. Without it the "Together" button is disabled.
3. Then a real two-phone test.

**Known limits:**
- No real network test yet (only the in-memory server); `webSocketTransport.ts` and `server/worker.ts` are untested.
- The code is the only secret: anyone who guesses a code can join or write. Fine for friends; add a per-room secret
  if it matters.
- If the server loses a room, clients that are ahead are not re-uploaded (no resync from client to server).
- A joiner's seat is private, so two phones could both claim the same existing seat.
- A new player whose join is refused after the fact (race) sees only a notice and has no seat.
- No QR code yet (link and code only); backups export the merged log as a plain local game.
- Rooms are never deleted on the server.

---

## Standing items (any time)

- Dependency updates and `npm audit` before each release.
- Accessibility pass: screen-reader labels for the map's routes and cities, keyboard navigation for the sheets.
- Ask a Turkish speaker to proofread `tr.json`.
- Keep the layout and label layout in sync: after changing city positions or curves, run `UPDATE_LABELS=1 npm test`.
