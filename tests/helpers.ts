import { makeAction, type Action, type ActionBody, type PlayerColor } from "../src/game/actions";
import { replay } from "../src/game/reducer";

export function setup(playerCount = 3): Action[] {
  const colors: PlayerColor[] = ["red", "blue", "green", "yellow", "black"];
  const actions: ActionBody[] = [{ type: "GAME_CREATED", gameId: "g1", playerCount }];
  for (let i = 0; i < playerCount; i++) {
    actions.push({ type: "PLAYER_ADDED", playerId: `p${i + 1}`, name: `P${i + 1}`, color: colors[i], isMe: i === 0 });
  }
  return actions.map((a) => makeAction(a));
}

export const act = (body: ActionBody) => makeAction(body);
export const stateOf = (...actions: Action[]) => replay(actions);
