import "fake-indexeddb/auto";
import { clear } from "idb-keyval";
import { beforeEach, describe, expect, it } from "vitest";
import { listGames } from "../src/history/gameIndex";
import { canUndo, useGame } from "../src/store/gameStore";

const players = [
  { name: "Ayşe", color: "red" as const, isMe: true },
  { name: "", color: "blue" as const, isMe: false },
];

const flush = () => new Promise((r) => setTimeout(r, 20));

beforeEach(async () => {
  await clear();
  useGame.getState().closeGame();
});

describe("game store", () => {
  it("creates a game, applies actions, undoes and persists", async () => {
    const game = useGame.getState();
    game.createGame(players);
    expect(useGame.getState().screen).toBe("game");
    expect(useGame.getState().state.players).toHaveLength(2);
    expect(canUndo(useGame.getState().actions)).toBe(false);
    expect(useGame.getState().undo()).toBe(false); // setup actions cannot be undone

    expect(useGame.getState().dispatch({ type: "ROUTE_CLAIMED", routeId: "budapest-wien-a", playerId: "p1" })).toBeNull();
    expect(useGame.getState().dispatch({ type: "ROUTE_CLAIMED", routeId: "budapest-wien-a", playerId: "p2" })).toBe("routeTaken");
    expect(useGame.getState().actions).toHaveLength(4);
    await flush();
    expect((await listGames())[0].players[0].score).toBe(1);

    expect(useGame.getState().undo()).toBe(true);
    expect(useGame.getState().state.claims).toEqual({});
    await flush();
    expect((await listGames())[0].players[0].score).toBe(0);
  });

  it("re-opens a saved game and can reopen an ended game", async () => {
    useGame.getState().createGame(players);
    const gameId = useGame.getState().state.gameId!;
    useGame.getState().dispatch({ type: "GAME_ENDED" });
    expect(useGame.getState().state.ended).toBe(true);
    await flush();

    useGame.getState().closeGame();
    expect(useGame.getState().screen).toBe("home");
    await useGame.getState().openGame(gameId, "summary");
    expect(useGame.getState().state.ended).toBe(true);
    expect(useGame.getState().screen).toBe("summary");

    useGame.getState().reopen();
    expect(useGame.getState().state.ended).toBe(false);
    expect(useGame.getState().screen).toBe("game");
    await flush();
    expect((await listGames())[0].ended).toBe(false);
  });
});
