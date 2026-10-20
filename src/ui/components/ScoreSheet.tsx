import { useTranslation } from "react-i18next";
import { isLastRound, longestPath, routeScore, stationsLeft, trainsLeft } from "../../game/selectors";
import type { GameState } from "../../game/state";
import { orderedPlayers, playerName } from "../names";
import { ColorDot } from "./ColorDot";
import { Sheet } from "./Sheet";

export function ScoreSheet({ state, onClose }: { state: GameState; onClose: () => void }) {
  const { t } = useTranslation();
  const players = orderedPlayers(state.players);
  const mine = players.find((p) => p.player.isMe);
  const others = players.filter((p) => !p.player.isMe);

  return (
    <Sheet title={t("score.title")} onClose={onClose} testId="score-sheet">
      {isLastRound(state) && !state.ended && <p className="banner warn">{t("game.lastRound")}</p>}

      {mine && (
        <section className="card" data-testid="score-me">
          <h3>
            <ColorDot color={mine.player.color} /> {t("score.me")}
          </h3>
          <dl className="stats-list">
            <dt>{t("score.routePoints")}</dt>
            <dd data-testid="me-route-points">{routeScore(state, mine.player.id)}</dd>
            <dt>{t("score.trainsLeft")}</dt>
            <dd data-testid="me-trains-left">{trainsLeft(state, mine.player.id)}</dd>
            <dt>{t("score.stationsLeft")}</dt>
            <dd data-testid="me-stations-left">{stationsLeft(state, mine.player.id)}</dd>
            <dt>{t("score.longestPath")}</dt>
            <dd>{longestPath(state, mine.player.id)}</dd>
          </dl>
        </section>
      )}

      {others.length > 0 && (
        <section className="card">
          <h3>{t("score.opponents")}</h3>
          <table className="score-table">
            <thead>
              <tr>
                <th />
                <th>{t("score.routeScore")}</th>
                <th>{t("score.trainsLeft")}</th>
              </tr>
            </thead>
            <tbody>
              {others.map(({ player, index }) => (
                <tr key={player.id} data-testid={`score-row-${player.id}`}>
                  <td>
                    <ColorDot color={player.color} size="s" /> {playerName(player, index, t)}
                  </td>
                  <td>{routeScore(state, player.id)}</td>
                  <td>{trainsLeft(state, player.id)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <p className="muted">{t("score.ticketsNote")}</p>
    </Sheet>
  );
}
