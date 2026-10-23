# Railtally sync server

A Cloudflare Worker with one Durable Object per game code. It runs the same `Room` class as the tests
(`src/sync/room.ts`), so the server decides which actions are legal and in which order they happen.

One-time setup (needs a free Cloudflare account, owner's step):

```bash
npx wrangler login
cd server && npx wrangler deploy      # prints https://railtally-sync.<account>.workers.dev
```

Then build the app with the server address (use `wss://`), or set it for testing in the browser console:

```bash
VITE_SYNC_URL=wss://railtally-sync.<account>.workers.dev BASE_PATH=/railtally/ npm run build
```

```js
localStorage.setItem("railtally:syncUrl", "wss://railtally-sync.<account>.workers.dev")
```

Optional: uncomment `ALLOWED_ORIGIN` in `wrangler.toml` so only the Pages site can open sockets.
Nothing here is deployed by the repository's scripts.
