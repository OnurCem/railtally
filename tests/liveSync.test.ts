import { describe, expect, it } from "vitest";
import { makeAction, type ActionBody } from "../src/game/actions";
import { replay } from "../src/game/reducer";
import { newSyncState } from "../src/sync/merge";
import { makeRoomCode } from "../src/sync/protocol";
import { RemoteAdapter } from "../src/sync/RemoteAdapter";
import { WebSocketTransport } from "../src/sync/webSocketTransport";

// Talks to a deployed server: LIVE_SYNC_URL=wss://… npx vitest run tests/liveSync.test.ts
const url = process.env.LIVE_SYNC_URL;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!url)("real server", () => {
  it("two clients converge over WebSocket", async () => {
    Object.assign(globalThis, { window: { addEventListener() {}, removeEventListener() {} } }); // WebSocketTransport listens for "online" on window
    const code = makeRoomCode();
    const make = (id: string) => {
      const adapter = new RemoteAdapter(new WebSocketTransport(url!, code), newSyncState(code, id), false);
      adapter.connect();
      return adapter;
    };
    const send = (a: RemoteAdapter, body: ActionBody) => void a.dispatch(makeAction(body, a.actorId));
    const host = make("host");
    await host.ready;
    send(host, { type: "GAME_CREATED", gameId: "g", playerCount: 2 });
    send(host, { type: "PLAYER_ADDED", playerId: "p1", name: "A", color: "red", isMe: false });
    await wait(1000);
    const guest = make("guest");
    await guest.ready;
    send(guest, { type: "PLAYER_ADDED", playerId: "p2", name: "B", color: "blue", isMe: false });
    send(host, { type: "ROUTE_CLAIMED", routeId: "budapest-wien-a", playerId: "p1" });
    send(guest, { type: "ROUTE_CLAIMED", routeId: "budapest-wien-a", playerId: "p2" });
    await wait(1500);
    const claims = (a: RemoteAdapter) => replay(a.log().filter((x) => x.type !== "ROUTE_CLAIMED" || x.playerId === "p1")).claims;
    expect(host.pendingCount + guest.pendingCount).toBe(0);
    expect(replay(host.log()).players).toHaveLength(2);
    expect(replay(guest.log()).claims).toEqual(replay(host.log()).claims);
    expect(Object.keys(claims(host))).toEqual(["budapest-wien-a"]);
    host.close();
    guest.close();
  }, 20000);
});
