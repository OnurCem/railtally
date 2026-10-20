import { useState } from "react";
import { useTranslation } from "react-i18next";
import { expressWinners, finalScore, winners } from "../../game/selectors";
import { useGame } from "../../store/gameStore";
import { ColorDot } from "../components/ColorDot";
import { orderedPlayers, playerName } from "../names";

function TicketInput({ playerId, value, disabled }: { playerId: string; value: number; disabled?: boolean }) {
  const { t } = useTranslation();
  const dispatch = useGame((s) => s.dispatch);
  const [text, setText] = useState(String(value));

  const commit = () => {
    const points = Number.parseInt(text, 10);
    if (Number.isNaN(points)) return setText(String(value));
    if (points !== value) dispatch({ type: "TICKET_POINTS_SET", playerId, points });
    setText(String(points));
  };

  return (
    <input
      type="number"
      inputMode="numeric"
      aria-label={t("end.tickets")}
      value={text}
      disabled={disabled}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      data-testid={`tickets-${playerId}`}
    />
  );
}

export function EndGame() {
  const { t } = useTranslation();
  const { state, go, closeGame, reopen, dispatch } = useGame();
  const ordered = orderedPlayers(state.players);
  const expressIds = expressWinners(state);
  const top = winners(state);

  const toggleExpress = (playerId: string) => {
    const next = expressIds.includes(playerId) ? expressIds.filter((id) => id !== playerId) : [...expressIds, playerId];
    dispatch({ type: "EXPRESS_OVERRIDE", winners: next });
  };

  const isAuto = state.expressOverride === null;

  return (
    <div className="screen page" data-testid="end-screen">
      <header className="page-header">
        <button className="button ghost" onClick={closeGame} data-testid="home">
          ← {t("game.home")}
        </button>
        <h1>{t("end.title")}</h1>
      </header>

      <p className="banner win" data-testid="winner">
        🏆 {t("end.winner", { count: top.length, names: top.map((p) => playerName(p, state.players.indexOf(p), t)).join(", ") })}
      </p>

      {ordered.map(({ player, index }) => {
        const score = finalScore(state, player.id);
        return (
          <section className="card" key={player.id} data-testid={`final-${player.id}`}>
            <h3>
              <ColorDot color={player.color} /> {playerName(player, index, t)}
              <span className="total" data-testid={`total-${player.id}`}>
                {score.total}
              </span>
            </h3>
            <dl className="stats-list">
              <dt>{t("end.routes")}</dt>
              <dd>{score.routes}</dd>
              <dt>{t("end.stations")}</dt>
              <dd>{score.stations}</dd>
              <dt>{t("end.ticketsRow")}</dt>
              <dd>
                <TicketInput key={state.ticketPoints[player.id] ?? 0} playerId={player.id} value={state.ticketPoints[player.id] ?? 0} />
              </dd>
              <dt>{t("end.expressRow")}</dt>
              <dd>
                <label className="check-inline">
                  <input
                    type="checkbox"
                    checked={expressIds.includes(player.id)}
                    onChange={() => toggleExpress(player.id)}
                    data-testid={`express-${player.id}`}
                  />
                  +{score.express || 10}
                </label>
              </dd>
            </dl>
          </section>
        );
      })}

      <p className="muted small">{t("end.ticketsHelp")}</p>
      <p className="muted small">{t("end.expressHelp")}</p>
      {!isAuto && (
        <button className="button" onClick={() => dispatch({ type: "EXPRESS_OVERRIDE", winners: null })}>
          {t("end.expressAuto")}
        </button>
      )}

      <div className="button-row">
        <button className="button" onClick={() => go("game")} data-testid="view-map">
          {t("end.viewMap")}
        </button>
        <button className="button" onClick={reopen} data-testid="reopen">
          {t("end.reopen")}
        </button>
      </div>
    </div>
  );
}
