import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PLAYER_COLORS, type PlayerColor } from "../../game/actions";
import { getSyncUrl } from "../../sync/config";
import { normalizeCode } from "../../sync/protocol";
import { JoinFailure, useGame, type JoinPreview } from "../../store/gameStore";
import { ColorDot } from "../components/ColorDot";
import { playerName } from "../names";

/** Reads (and removes) the code of a shared link like `…/#join=ABC234`. */
export function joinCodeFromHash(): string | null {
  const match = /^#join=([A-Za-z0-9-]+)$/.exec(window.location.hash);
  return match ? normalizeCode(match[1]) : null;
}

const initialCode = () => {
  const code = joinCodeFromHash();
  if (code) window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
  return code ?? "";
};

export function JoinGame() {
  const { t } = useTranslation();
  const { go, previewGame, joinGame, cancelJoin, openGame } = useGame();
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<JoinPreview | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState<PlayerColor | null>(null);
  const configured = getSyncUrl() !== null;

  const players = preview?.state.players ?? [];
  const full = !!preview && players.length >= preview.state.playerCount;
  const freeColors = PLAYER_COLORS.filter((c) => !players.some((p) => p.color === c));
  const chosenColor = color && freeColors.includes(color) ? color : freeColors[0];

  const back = () => {
    cancelJoin();
    go("home");
  };

  const lookUp = async () => {
    setBusy(true);
    setError(null);
    try {
      const found = await previewGame(code);
      if (found.existing) await openGame(found.gameId, "game");
      else setPreview(found);
    } catch (e) {
      setError(t(`join.errors.${e instanceof JoinFailure ? e.code : "offline"}`));
    } finally {
      setBusy(false);
    }
  };

  const finish = (choice: Parameters<typeof joinGame>[0]) => {
    const failed = joinGame(choice);
    if (failed) setError(t(`errors.${failed}`));
  };

  return (
    <div className="screen page">
      <header className="page-header">
        <button className="button ghost" onClick={back}>
          ← {t("common.back")}
        </button>
        <h1>{t("join.title")}</h1>
      </header>

      {!configured && <p className="banner warn" data-testid="join-not-configured">{t("join.errors.notConfigured")}</p>}

      {!preview && (
        <>
          <label className="field">
            <span>{t("join.code")}</span>
            <input
              type="text"
              value={code}
              maxLength={8}
              autoCapitalize="characters"
              autoComplete="off"
              placeholder="ABC-234"
              onChange={(e) => setCode(e.target.value)}
              data-testid="join-code"
            />
          </label>
          <button className="button primary big" disabled={busy || !configured || !normalizeCode(code)} onClick={() => void lookUp()} data-testid="join-lookup">
            {busy ? t("join.looking") : t("join.lookup")}
          </button>
        </>
      )}

      {preview && (
        <>
          <p>{t("join.found", { count: players.length, total: preview.state.playerCount })}</p>
          <section>
            <h2>{t("join.whichAreYou")}</h2>
            <ul className="list">
              {players.map((p, i) => (
                <li key={p.id}>
                  <button className="row-button" onClick={() => finish({ seat: p.id })} data-testid={`take-seat-${i + 1}`}>
                    <ColorDot color={p.color} size="s" /> {playerName(p, i, t)}
                  </button>
                </li>
              ))}
            </ul>
          </section>
          {!full && (
            <section className="card" data-testid="join-new">
              <h2>{t("join.newPlayer")}</h2>
              <label className="field">
                <span>{t("newGame.name")}</span>
                <input type="text" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} data-testid="join-name" />
              </label>
              <div className="swatches" role="radiogroup" aria-label={t("newGame.color")}>
                {freeColors.map((c) => (
                  <button
                    key={c}
                    role="radio"
                    aria-checked={chosenColor === c}
                    aria-label={t(`colors.${c}`)}
                    className={chosenColor === c ? "swatch active" : "swatch"}
                    onClick={() => setColor(c)}
                  >
                    <ColorDot color={c} />
                  </button>
                ))}
              </div>
              <button className="button primary big" onClick={() => finish({ name, color: chosenColor })} data-testid="join-start">
                {t("join.joinAsNew")}
              </button>
            </section>
          )}
        </>
      )}
      {error && <p role="alert" className="error" data-testid="join-error">{error}</p>}
    </div>
  );
}
