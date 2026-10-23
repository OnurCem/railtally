import "fake-indexeddb/auto";
import { clear } from "idb-keyval";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isPrivateAction } from "../src/game/actions";
import { deleteGame, listGames } from "../src/history/gameIndex";
import { sharedMemoryHub } from "../src/sync/config";
import { RemoteAdapter } from "../src/sync/RemoteAdapter";
import { JoinFailure, useGame } from "../src/store/gameStore";

const store = new Map<string, string>();
const flushSaves = () => (useGame.getState().adapter as RemoteAdapter).flush();
const settle = () => sharedMemoryHub().settle();

beforeEach(async () => {
  await clear();
  store.clear();
  sharedMemoryHub().rooms.clear();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) },
  });
  store.set("railtally:syncUrl", "memory:");
  useGame.getState().closeGame();
});

afterEach(() => useGame.getState().closeGame());

describe("shared games in the store", () => {
  it("creates, is joined by a second device, shares public changes only, and survives a reload", async () => {
    const game = useGame.getState();
    game.createSharedGame(2, { name: "Ayşe", color: "red" });
    const host = useGame.getState();
    expect(host.shared?.code).toHaveLength(6);
    expect(host.state.players.map((p) => p.isMe)).toEqual([true]);
    const { code } = host.shared!;
    const gameId = host.state.gameId!;
    host.dispatch({ type: "TICKET_ADDED", ticketId: "bruxelles-danzig" });
    host.dispatch({ type: "ROUTE_CLAIMED", routeId: "budapest-wien-a", playerId: host.state.players[0].id });
    await settle();
    expect(sharedMemoryHub().room(code).entries).toHaveLength(3); // created, player, claim
    const hostPlayer = useGame.getState().state.players[0].id;
    await flushSaves();
    useGame.getState().closeGame();
    await deleteGame(gameId); // pretend the next steps happen on another phone

    await expect(useGame.getState().previewGame("zz")).rejects.toMatchObject({ code: "invalidCode" });
    await expect(useGame.getState().previewGame("AAAAAA")).rejects.toBeInstanceOf(JoinFailure);
    const preview = await useGame.getState().previewGame(code.toLowerCase());
    expect(preview.state.players).toHaveLength(1);
    expect(preview.state.players[0].isMe).toBe(false); // seats are private to each device
    expect(preview.state.myTickets).toEqual([]);
    expect(useGame.getState().joinGame({ name: "Can", color: "red" })).toBe("colorTaken");
    expect(useGame.getState().joinGame({ name: "Can", color: "blue" })).toBeNull();
    const guest = useGame.getState();
    expect(guest.state.players).toHaveLength(2);
    expect(guest.state.players.find((p) => p.isMe)?.name).toBe("Can");
    expect(guest.state.claims).toEqual({ "budapest-wien-a": hostPlayer });
    expect(guest.dispatch({ type: "ROUTE_CLAIMED", routeId: "budapest-wien-a", playerId: guest.state.players[1].id })).toBe("routeTaken");
    expect(guest.dispatch({ type: "ROUTE_CLAIMED", routeId: "berlin-essen-a", playerId: guest.state.players[1].id })).toBeNull();
    await settle();
    const room = sharedMemoryHub().room(code);
    expect(room.entries.every((e) => e.kind !== "action" || !isPrivateAction(e.action))).toBe(true);
    expect(room.entries).toHaveLength(5);

    // undo takes back my own newest action only
    expect(useGame.getState().undo()).toBe(true);
    await settle();
    expect(Object.keys(useGame.getState().state.claims)).toEqual(["budapest-wien-a"]);
    expect(useGame.getState().undo()).toBe(false);
    expect(room.effectiveActions().filter((a) => a.type === "ROUTE_CLAIMED")).toHaveLength(1);
    await flushSaves();

    // reload: the game is listed, reopening it reconnects and keeps the seat
    useGame.getState().closeGame();
    expect((await listGames())[0].players.map((p) => p.name)).toEqual(["Ayşe", "Can"]);
    await useGame.getState().openGame(gameId, "game");
    expect(useGame.getState().shared?.code).toBe(code);
    expect(useGame.getState().state.players.find((p) => p.isMe)?.name).toBe("Can");
    await settle();
    expect(useGame.getState().shared?.status).toBe("online");
  });

  it("a second previewGame for a game already on this device opens it", async () => {
    useGame.getState().createSharedGame(2, { name: "", color: "green" });
    const { code } = useGame.getState().shared!;
    await settle();
    await flushSaves();
    useGame.getState().closeGame();
    const found = await useGame.getState().previewGame(code);
    expect(found.existing).toBe(true);
  });
});
