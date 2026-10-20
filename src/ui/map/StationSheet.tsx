import { useTranslation } from "react-i18next";
import { cityById } from "../../data/lookup";
import type { ActionBody } from "../../game/actions";
import { stationPlaceError } from "../../game/rules";
import type { GameState } from "../../game/state";
import { ColorDot } from "../components/ColorDot";
import { Sheet } from "../components/Sheet";
import { orderedPlayers, playerName } from "../names";

interface Props {
  state: GameState;
  cityId: string;
  onAction: (body: ActionBody) => void;
  onClose: () => void;
}

export function StationSheet({ state, cityId, onAction, onClose }: Props) {
  const { t } = useTranslation();
  const city = cityById.get(cityId)!;
  const ownerId = state.stations[cityId];
  const ownerIndex = state.players.findIndex((p) => p.id === ownerId);

  return (
    <Sheet title={t("game.stationTitle", { city: city.name })} onClose={onClose} testId="station-sheet">
      {ownerId ? (
        <>
          <p className="banner">
            <ColorDot color={state.players[ownerIndex].color} size="s" />{" "}
            {t("game.stationOwner", { name: playerName(state.players[ownerIndex], ownerIndex, t) })}
          </p>
          <button className="button danger" data-testid="remove-station" onClick={() => onAction({ type: "STATION_REMOVED", cityId, playerId: ownerId })}>
            {t("game.removeStation")}
          </button>
        </>
      ) : (
        <>
          <h3>{t("game.placeStation")}</h3>
          <ul className="list">
            {orderedPlayers(state.players).map(({ player, index }) => {
              const error = stationPlaceError(state, cityId, player.id);
              return (
                <li key={player.id}>
                  <button
                    className="row-button"
                    disabled={!!error}
                    data-testid={`station-${player.id}`}
                    onClick={() => onAction({ type: "STATION_PLACED", cityId, playerId: player.id })}
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
