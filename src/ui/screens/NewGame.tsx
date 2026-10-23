import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PLAYER_COLORS, type PlayerColor } from "../../game/actions";
import { getSyncUrl } from "../../sync/config";
import { useGame } from "../../store/gameStore";
import { ColorDot } from "../components/ColorDot";

interface Draft {
  name: string;
  color: PlayerColor;
}

const makeDrafts = (count: number, previous: Draft[] = []): Draft[] =>
  Array.from({ length: count }, (_, i) => previous[i] ?? { name: "", color: PLAYER_COLORS[i] });

export function NewGame() {
  const { t } = useTranslation();
  const { createGame, createSharedGame, go } = useGame();
  const [together, setTogether] = useState(false);
  const configured = getSyncUrl() !== null;
  const [count, setCount] = useState(3);
  const [drafts, setDrafts] = useState<Draft[]>(() => makeDrafts(5));
  const [me, setMe] = useState(0);

  const players = drafts.slice(0, count);

  const setCountSafe = (n: number) => {
    setCount(n);
    if (me >= n) setMe(0);
  };

  const patch = (i: number, p: Partial<Draft>) => setDrafts((d) => d.map((x, j) => (j === i ? { ...x, ...p } : x)));

  /** Choosing a color that another player has swaps the two. */
  const pickColor = (i: number, color: PlayerColor) => {
    setDrafts((all) => {
      const other = all.findIndex((d, j) => j !== i && j < 5 && d.color === color);
      return all.map((d, j) => {
        if (j === i) return { ...d, color };
        if (j === other) return { ...d, color: all[i].color };
        return d;
      });
    });
  };

  const start = () =>
    together
      ? createSharedGame(count, { name: drafts[0].name, color: drafts[0].color })
      : createGame(players.map((p, i) => ({ name: p.name, color: p.color, isMe: i === me })));

  return (
    <div className="screen page">
      <header className="page-header">
        <button className="button ghost" onClick={() => go("home")}>
          ← {t("common.back")}
        </button>
        <h1>{t("newGame.title")}</h1>
      </header>

      <fieldset className="field">
        <legend>{t("newGame.mode")}</legend>
        <div className="segmented" role="radiogroup">
          <button role="radio" aria-checked={!together} className={!together ? "seg active" : "seg"} onClick={() => setTogether(false)} data-testid="mode-local">
            {t("newGame.modeLocal")}
          </button>
          <button role="radio" aria-checked={together} className={together ? "seg active" : "seg"} onClick={() => setTogether(true)} data-testid="mode-together">
            {t("newGame.modeTogether")}
          </button>
        </div>
        {together && <p className="muted small">{configured ? t("newGame.togetherHint") : t("join.errors.notConfigured")}</p>}
      </fieldset>

      <fieldset className="field">
        <legend>{t("newGame.playerCount")}</legend>
        <div className="segmented" role="radiogroup">
          {[2, 3, 4, 5].map((n) => (
            <button
              key={n}
              role="radio"
              aria-checked={count === n}
              className={count === n ? "seg active" : "seg"}
              onClick={() => setCountSafe(n)}
              data-testid={`count-${n}`}
            >
              {n}
            </button>
          ))}
        </div>
      </fieldset>

      {(together ? players.slice(0, 1) : players).map((p, i) => (
        <section className="card" key={i} data-testid={`player-${i + 1}`}>
          <label className="field">
            <span>{t("common.player", { n: i + 1 })}</span>
            <input
              type="text"
              value={p.name}
              maxLength={20}
              placeholder={t("newGame.name")}
              onChange={(e) => patch(i, { name: e.target.value })}
              data-testid={`name-${i + 1}`}
            />
          </label>
          <div className="swatches" role="radiogroup" aria-label={t("newGame.color")}>
            {PLAYER_COLORS.map((c) => (
              <button
                key={c}
                role="radio"
                aria-checked={p.color === c}
                aria-label={t(`colors.${c}`)}
                className={p.color === c ? "swatch active" : "swatch"}
                onClick={() => pickColor(i, c)}
                data-testid={`color-${i + 1}-${c}`}
              >
                <ColorDot color={c} />
              </button>
            ))}
          </div>
          {!together && (
          <label className="field check">
            <input type="radio" name="me" checked={me === i} onChange={() => setMe(i)} data-testid={`me-${i + 1}`} />
            <span>{t("newGame.isMe")}</span>
          </label>
          )}
        </section>
      ))}

      <button className="button primary big" onClick={start} disabled={together && !configured} data-testid="start-game">
        {together ? t("newGame.startTogether") : t("newGame.start")}
      </button>
    </div>
  );
}
