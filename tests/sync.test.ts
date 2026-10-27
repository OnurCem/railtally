import "fake-indexeddb/auto";
import { clear } from "idb-keyval";
import { beforeEach, describe, expect, it } from "vitest";
import { isPrivateAction, makeAction, type Action, type ActionBody } from "../src/game/actions";
import { replay, replayTolerant } from "../src/game/reducer";
import { applyEntries, effectiveLog, newSyncState } from "../src/sync/merge";
import { MemoryHub } from "../src/sync/memoryTransport";
import { formatCode, LIMITS, makeRoomCode, normalizeCode } from "../src/sync/protocol";
import { loadSyncState, RemoteAdapter, type Rejection } from "../src/sync/RemoteAdapter";
import { Room } from "../src/sync/room";

const CODE = "ABC234";

function client(hub: MemoryHub, deviceId: string, persist = false) {
  const transport = hub.transport(CODE);
  const adapter = new RemoteAdapter(transport, newSyncState(CODE, deviceId), persist);
  const rejections: Rejection[] = [];
  adapter.subscribeRejections((r) => rejections.push(r));
  adapter.connect();
  const send = (body: ActionBody) => {
    const action = makeAction(body, deviceId);
    void adapter.dispatch(action);
    return action;
  };
  return { adapter, transport, rejections, send };
}

const setup = (host: ReturnType<typeof client>) => {
  host.send({ type: "GAME_CREATED", gameId: "g1", playerCount: 3 });
  host.send({ type: "PLAYER_ADDED", playerId: "p1", name: "A", color: "red", isMe: false });
};
const join = (c: ReturnType<typeof client>, playerId: string, color: "blue" | "green") =>
  c.send({ type: "PLAYER_ADDED", playerId, name: playerId, color, isMe: false });

beforeEach(async () => {
  await clear();
});

describe("room codes", () => {
  it("makes and parses codes", () => {
    const code = makeRoomCode();
    expect(code).toHaveLength(6);
    expect(normalizeCode(formatCode(code).toLowerCase())).toBe(code);
    expect(normalizeCode("abc")).toBeNull();
    expect(normalizeCode("ABC-0OI")).toBeNull();
  });
});

describe("Room (authority)", () => {
  const act = (body: ActionBody, actorId = "a") => makeAction(body, actorId);

  it("numbers accepted actions, rejects illegal and private ones", () => {
    const room = new Room();
    const created = act({ type: "GAME_CREATED", gameId: "g", playerCount: 2 });
    expect(room.receive({ t: "action", action: created }).appended[0].seq).toBe(1);
    expect(room.receive({ t: "action", action: created }).appended).toHaveLength(0); // retry is a no-op
    const again = room.receive({ t: "action", action: act({ type: "GAME_CREATED", gameId: "g", playerCount: 2 }) });
    expect(again.reply[0]).toMatchObject({ t: "rejected", code: "gameExists" });
    const ticket = act({ type: "TICKET_ADDED", ticketId: "x" });
    expect(room.receive({ t: "action", action: ticket }).reply[0]).toMatchObject({ code: "private" });
    expect(room.lastSeq).toBe(1);
  });

  it("settles two claims of the same route: the first one wins", () => {
    const room = new Room();
    const bodies: ActionBody[] = [
      { type: "GAME_CREATED", gameId: "g", playerCount: 2 },
      { type: "PLAYER_ADDED", playerId: "p1", name: "", color: "red", isMe: false },
      { type: "PLAYER_ADDED", playerId: "p2", name: "", color: "blue", isMe: false },
    ];
    bodies.forEach((b) => room.receive({ t: "action", action: act(b) }));
    const first = act({ type: "ROUTE_CLAIMED", routeId: "budapest-wien-a", playerId: "p1" });
    const second = act({ type: "ROUTE_CLAIMED", routeId: "budapest-wien-a", playerId: "p2" });
    expect(room.receive({ t: "action", action: first }).appended).toHaveLength(1);
    expect(room.receive({ t: "action", action: second }).reply[0]).toMatchObject({ code: "routeTaken", ref: second.id });
  });

  it("revokes only when the rest of the log stays legal", () => {
    const room = new Room();
    const list: Action[] = [
      act({ type: "GAME_CREATED", gameId: "g", playerCount: 2 }),
      act({ type: "PLAYER_ADDED", playerId: "p1", name: "", color: "red", isMe: false }),
      act({ type: "GAME_ENDED" }),
    ];
    list.forEach((a) => room.receive({ t: "action", action: a }));
    expect(room.receive({ t: "revoke", actionId: list[1].id }).reply[0]).toMatchObject({ code: "setupLocked" });
    expect(room.receive({ t: "revoke", actionId: "nope" }).reply[0]).toMatchObject({ code: "unknownAction" });
    expect(room.receive({ t: "revoke", actionId: list[2].id }).appended).toHaveLength(1);
    expect(room.receive({ t: "revoke", actionId: list[2].id }).appended).toHaveLength(0); // twice is fine
    expect(replay(room.effectiveActions()).ended).toBe(false);
  });
});

describe("Room limits", () => {
  it("stops growing at the entry cap", () => {
    const room = new Room();
    room.receive({ t: "action", action: makeAction({ type: "GAME_CREATED", gameId: "g", playerCount: 2 }, "a") });
    for (const [i, color] of (["red", "blue"] as const).entries()) {
      room.receive({ t: "action", action: makeAction({ type: "PLAYER_ADDED", playerId: `p${i}`, name: "", color, isMe: false }, "a") });
    }
    // fill the log with claim/unclaim pairs (revoke entries count too)
    const claim = makeAction({ type: "ROUTE_CLAIMED", routeId: "budapest-wien-a", playerId: "p0" }, "a");
    room.receive({ t: "action", action: claim });
    for (let i = 0; room.lastSeq < LIMITS.maxEntries; i++) {
      room.receive({ t: "action", action: makeAction({ type: "EXPRESS_OVERRIDE", winners: null }, "a") });
    }
    const over = makeAction({ type: "EXPRESS_OVERRIDE", winners: null }, "a");
    expect(room.receive({ t: "action", action: over }).reply[0]).toMatchObject({ code: "roomFull" });
    expect(room.receive({ t: "revoke", actionId: claim.id }).reply[0]).toMatchObject({ code: "roomFull" });
    expect(room.lastSeq).toBe(LIMITS.maxEntries);
  });
});

describe("merge", () => {
  it("applies entries in order, detects gaps and ignores repeats", () => {
    const a = makeAction({ type: "GAME_CREATED", gameId: "g", playerCount: 2 }, "x");
    const b = makeAction({ type: "GAME_ENDED" }, "x");
    const s0 = newSyncState(CODE, "d");
    const gap = applyEntries(s0, [{ seq: 2, kind: "action", action: b }]);
    expect(gap.gap).toBe(true);
    const ok = applyEntries(s0, [{ seq: 2, kind: "action", action: b }, { seq: 1, kind: "action", action: a }]);
    expect(ok.state.entries.map((e) => e.seq)).toEqual([1, 2]);
    expect(applyEntries(ok.state, [{ seq: 1, kind: "action", action: a }]).changed).toBe(false);
  });
});

describe("RemoteAdapter with an in-memory server", () => {
  it("two devices converge on the same log and never exchange private actions", async () => {
    const hub = new MemoryHub();
    const host = client(hub, "host");
    setup(host);
    await hub.settle();
    const guest = client(hub, "guest");
    await guest.adapter.ready;
    join(guest, "p2", "blue");
    guest.send({ type: "TICKET_ADDED", ticketId: "bruxelles-danzig" });
    guest.send({ type: "SEAT_TAKEN", playerId: "p2" });
    host.send({ type: "ROUTE_CLAIMED", routeId: "budapest-wien-a", playerId: "p1" });
    await hub.settle();

    const publicOf = (c: ReturnType<typeof client>) => c.adapter.log().filter((a) => !isPrivateAction(a)).map((a) => a.id);
    expect(publicOf(host)).toEqual(publicOf(guest));
    expect(publicOf(host)).toHaveLength(4);
    expect(host.adapter.log().some(isPrivateAction)).toBe(false);
    expect(guest.adapter.log().filter(isPrivateAction)).toHaveLength(2);
    expect(hub.room(CODE).entries.every((e) => e.kind !== "action" || !isPrivateAction(e.action))).toBe(true);
    expect(replay(host.adapter.log()).claims).toEqual({ "budapest-wien-a": "p1" });
    expect(replay(guest.adapter.log()).players.find((p) => p.isMe)?.id).toBe("p2");
    expect(host.adapter.pendingCount + guest.adapter.pendingCount).toBe(0);
  });

  it("a simultaneous claim of one route: loser's pending action is dropped and reported", async () => {
    const hub = new MemoryHub();
    const host = client(hub, "host");
    setup(host);
    await hub.settle();
    const guest = client(hub, "guest");
    await guest.adapter.ready;
    join(guest, "p2", "blue");
    await hub.settle();

    host.send({ type: "ROUTE_CLAIMED", routeId: "budapest-wien-a", playerId: "p1" });
    guest.send({ type: "ROUTE_CLAIMED", routeId: "budapest-wien-a", playerId: "p2" });
    // before the server answers, the guest's own view is the optimistic one
    expect(replayTolerant(guest.adapter.log()).state.claims["budapest-wien-a"]).toBe("p2");
    await hub.settle();

    expect(replay(host.adapter.log()).claims["budapest-wien-a"]).toBe("p1");
    expect(replay(guest.adapter.log()).claims["budapest-wien-a"]).toBe("p1");
    expect(guest.rejections).toHaveLength(1);
    expect(guest.rejections[0]).toMatchObject({ code: "routeTaken", action: { type: "ROUTE_CLAIMED", playerId: "p2" } });
    expect(host.rejections).toHaveLength(0);
  });

  it("works offline and catches up on reconnect, in both directions", async () => {
    const hub = new MemoryHub();
    const host = client(hub, "host");
    setup(host);
    await hub.settle();
    const guest = client(hub, "guest");
    await guest.adapter.ready;
    join(guest, "p2", "blue");
    await hub.settle();

    guest.transport.goOffline();
    expect(guest.adapter.status).toBe("offline");
    guest.send({ type: "ROUTE_CLAIMED", routeId: "budapest-wien-a", playerId: "p2" });
    guest.send({ type: "STATION_PLACED", cityId: "wien" as never, playerId: "p2" });
    host.send({ type: "ROUTE_CLAIMED", routeId: "berlin-essen-a", playerId: "p1" });
    await hub.settle();
    expect(guest.adapter.pendingCount).toBe(2);
    expect(replayTolerant(guest.adapter.log()).state.claims).toEqual({ "budapest-wien-a": "p2" });

    guest.transport.goOnline();
    await hub.settle();
    expect(guest.adapter.pendingCount).toBe(0);
    const claims = replay(host.adapter.log()).claims;
    expect(claims).toEqual({ "berlin-essen-a": "p1", "budapest-wien-a": "p2" });
    expect(replay(guest.adapter.log()).claims).toEqual(claims);
    expect(guest.rejections).toHaveLength(0);
  });

  it("resending after a lost acknowledgement does not duplicate", async () => {
    const hub = new MemoryHub();
    const host = client(hub, "host");
    setup(host);
    await hub.settle();
    host.transport.goOffline();
    host.send({ type: "ROUTE_CLAIMED", routeId: "budapest-wien-a", playerId: "p1" });
    host.transport.goOnline();
    host.transport.goOffline();
    host.transport.goOnline();
    await hub.settle();
    expect(hub.room(CODE).entries.filter((e) => e.kind === "action")).toHaveLength(3);
    expect(host.adapter.pendingCount).toBe(0);
  });

  it("undo is a revocation that every device sees; a refused undo is reported", async () => {
    const hub = new MemoryHub();
    const host = client(hub, "host");
    setup(host);
    await hub.settle();
    const guest = client(hub, "guest");
    await guest.adapter.ready;
    join(guest, "p2", "blue");
    const claim = host.send({ type: "ROUTE_CLAIMED", routeId: "budapest-wien-a", playerId: "p1" });
    const end = host.send({ type: "GAME_ENDED" });
    await hub.settle();

    void host.adapter.remove(end.id); // the host re-opens the game
    await hub.settle();
    expect(replay(guest.adapter.log()).ended).toBe(false);
    void guest.adapter.remove(claim.id); // anybody can take back a claim
    await hub.settle();
    expect(replay(host.adapter.log()).claims).toEqual({});
    expect(host.adapter.log().map((a) => a.id)).not.toContain(claim.id);

    // setup actions cannot be undone
    void host.adapter.remove(host.adapter.log()[0].id);
    await hub.settle();
    expect(host.rejections[0]).toMatchObject({ code: "setupLocked", wasUndo: true });
    expect(host.adapter.log()[0].type).toBe("GAME_CREATED");
  });

  it("keeps private actions after the action they followed", async () => {
    const hub = new MemoryHub();
    const host = client(hub, "host");
    setup(host);
    host.send({ type: "SEAT_TAKEN", playerId: "p1" });
    host.send({ type: "GAME_ENDED" });
    await hub.settle();
    const types = host.adapter.log().map((a) => a.type);
    expect(types).toEqual(["GAME_CREATED", "PLAYER_ADDED", "SEAT_TAKEN", "GAME_ENDED"]);
    expect(effectiveLog(host.adapter.state)).toHaveLength(4);
  });

  it("saves and restores a shared game from IndexedDB", async () => {
    const hub = new MemoryHub();
    const host = client(hub, "host", true);
    setup(host);
    host.send({ type: "SEAT_TAKEN", playerId: "p1" });
    await hub.settle();
    await host.adapter.flush();
    const saved = await loadSyncState("g1");
    expect(saved?.code).toBe(CODE);
    expect(saved?.entries).toHaveLength(2);
    expect(saved?.privates).toHaveLength(1);

    const again = new RemoteAdapter(hub.transport(CODE), saved!, false);
    expect(again.log().map((a) => a.type)).toEqual(["GAME_CREATED", "PLAYER_ADDED", "SEAT_TAKEN"]);
  });
});
