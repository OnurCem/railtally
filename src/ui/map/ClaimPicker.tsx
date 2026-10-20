import { useTranslation } from "react-i18next";
import { cityById, routeById } from "../../data/lookup";
import type { ActionBody } from "../../game/actions";
import { claimError } from "../../game/rules";
import type { GameState } from "../../game/state";
import { ColorDot } from "../components/ColorDot";
import { Sheet } from "../components/Sheet";
import { orderedPlayers, playerName } from "../names";

interface Props {
  state: GameState;
  /** routes found near the tap */
  candidates: string[];
  selected: string | null;
  onSelect: (routeId: string) => void;
  onAction: (body: ActionBody) => void;
  onClose: () => void;
}

function routeLabel(routeId: string) {
  const route = routeById.get(routeId)!;
  return { route, from: cityById.get(route.from)!.name, to: cityById.get(route.to)!.name };
}

export function ClaimPicker({ state, candidates, selected, onSelect, onAction, onClose }: Props) {
  const { t } = useTranslation();

  if (!selected) {
    return (
      <Sheet title={t("game.whichRoute")} onClose={onClose} testId="route-list">
        <ul className="list">
          {candidates.map((id) => {
            const { route, from, to } = routeLabel(id);
            return (
              <li key={id}>
                <button className="row-button" onClick={() => onSelect(id)} data-testid={`candidate-${id}`}>
                  <ColorDot kind="route" color={route.color} />
                  <span>
                    {from} – {to}
                  </span>
                  <span className="muted">{t("game.spaces", { count: route.length })}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </Sheet>
    );
  }

  const { route, from, to } = routeLabel(selected);
  const ownerId = state.claims[selected];
  const owner = state.players.findIndex((p) => p.id === ownerId);

  return (
    <Sheet title={t("game.claimTitle", { from, to })} onClose={onClose} testId="claim-picker">
      <p className="chips">
        <span className="chip">
          <ColorDot kind="route" color={route.color} size="s" /> {t(`colors.${route.color}`)}
        </span>
        <span className="chip">{t("game.spaces", { count: route.length })}</span>
        {route.tunnel && <span className="chip">{t("game.tunnel")}</span>}
        {route.ferryLocomotives > 0 && <span className="chip">{t("game.ferry", { count: route.ferryLocomotives })}</span>}
      </p>

      {ownerId ? (
        <>
          <p className="banner">
            <ColorDot color={state.players[owner].color} size="s" />{" "}
            {t("game.claimedBy", { name: playerName(state.players[owner], owner, t) })}
          </p>
          <button className="button danger" data-testid="free-route" onClick={() => onAction({ type: "ROUTE_UNCLAIMED", routeId: selected })}>
            {t("game.free")}
          </button>
        </>
      ) : (
        <>
          <h3>{t("game.claimFor")}</h3>
          <ul className="list">
            {orderedPlayers(state.players).map(({ player, index }) => {
              const error = claimError(state, selected, player.id);
              return (
                <li key={player.id}>
                  <button
                    className="row-button"
                    disabled={!!error}
                    data-testid={`claim-${player.id}`}
                    onClick={() => onAction({ type: "ROUTE_CLAIMED", routeId: selected, playerId: player.id })}
                  >
                    <ColorDot color={player.color} />
                    <span>{playerName(player, index, t)}</span>
                    {error && <span className="muted small">{t(`errors.${error}`)}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Sheet>
  );
}
