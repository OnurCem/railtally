import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { exportAll, importAll } from "../../history/exportImport";
import { computeStats, deleteGame, listGames, type GameSummary } from "../../history/gameIndex";
import { useGame } from "../../store/gameStore";
import { ColorDot } from "../components/ColorDot";
import { SettingsSheet } from "../components/SettingsSheet";
import { playerName } from "../names";

function GameCard({ game, onOpen, onDelete }: { game: GameSummary; onOpen: () => void; onDelete: () => void }) {
  const { t } = useTranslation();
  const date = new Date(game.endedAt ?? game.createdAt).toLocaleDateString();
  const winners = game.players.filter((p) => game.winnerIds.includes(p.id));
  return (
    <li className="card game-card" data-testid="game-card">
      <button className="game-main" onClick={onOpen}>
        <span className="muted small">
          {date} · {t("home.players", { count: game.players.length })}
        </span>
        <span className="game-players">
          {game.players.map((p, i) => (
            <span key={p.id} className="game-player">
              <ColorDot color={p.color} size="s" /> {playerName(p, i, t)} <strong>{p.score}</strong>
            </span>
          ))}
        </span>
        {winners.length > 0 && (
          <span className="small">
            🏆 {t("home.winner")}: {winners.map((w) => playerName(w, game.players.indexOf(w), t)).join(", ")}
          </span>
        )}
      </button>
      <button className="icon-button" aria-label={t("common.delete")} onClick={onDelete} data-testid="delete-game">
        🗑
      </button>
    </li>
  );
}

export function Home() {
  const { t } = useTranslation();
  const { go, openGame } = useGame();
  const [games, setGames] = useState<GameSummary[] | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => setGames(await listGames()), []);
  useEffect(() => {
    let cancelled = false;
    void listGames().then((list) => {
      if (!cancelled) setGames(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const remove = async (game: GameSummary) => {
    if (!window.confirm(t("home.deleteConfirm"))) return;
    await deleteGame(game.gameId);
    await refresh();
  };

  const doExport = async () => {
    const blob = new Blob([await exportAll()], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `rotaray-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const doImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const { imported, skipped } = await importAll(await file.text());
      setMessage([t("home.importDone", { count: imported }), skipped ? t("home.importSkipped", { count: skipped }) : ""].join(" ").trim());
      await refresh();
    } catch {
      setMessage(t("home.importFailed"));
    }
    if (fileInput.current) fileInput.current.value = "";
  };

  const active = games?.filter((g) => !g.ended) ?? [];
  const finished = games?.filter((g) => g.ended) ?? [];
  const stats = computeStats(games ?? []);

  return (
    <div className="screen page">
      <header className="page-header home-header">
        <div>
          <h1>{t("app.name")}</h1>
          <p className="muted">{t("app.tagline")}</p>
        </div>
        <button className="button ghost" onClick={() => setShowSettings(true)} data-testid="open-settings">
          ⚙ {t("settings.title")}
        </button>
      </header>

      <button className="button primary big" onClick={() => go("new")} data-testid="new-game">
        {t("home.newGame")}
      </button>

      {games && games.length === 0 && <p className="muted">{t("home.noGames")}</p>}

      {active.length > 0 && (
        <section>
          <h2>{t("home.active")}</h2>
          <ul className="list">
            {active.map((g) => (
              <GameCard key={g.gameId} game={g} onOpen={() => void openGame(g.gameId, "game")} onDelete={() => void remove(g)} />
            ))}
          </ul>
        </section>
      )}

      {finished.length > 0 && (
        <section>
          <h2>{t("home.finished")}</h2>
          <ul className="list">
            {finished.map((g) => (
              <GameCard key={g.gameId} game={g} onOpen={() => void openGame(g.gameId, "summary")} onDelete={() => void remove(g)} />
            ))}
          </ul>
        </section>
      )}

      {stats.gamesPlayed > 0 && (
        <section className="card" data-testid="stats">
          <h2>{t("home.stats")}</h2>
          <dl className="stats-list">
            <dt>{t("home.gamesPlayed")}</dt>
            <dd>{stats.gamesPlayed}</dd>
            <dt>{t("home.wins")}</dt>
            <dd>{stats.wins}</dd>
            <dt>{t("home.averageScore")}</dt>
            <dd>{stats.averageScore}</dd>
            <dt>{t("home.favoriteColor")}</dt>
            <dd>{stats.favoriteColor && <ColorDot color={stats.favoriteColor} size="s" />} {stats.favoriteColor && t(`colors.${stats.favoriteColor}`)}</dd>
          </dl>
        </section>
      )}

      <section>
        <h2>{t("home.backup")}</h2>
        <div className="button-row">
          <button className="button" onClick={() => void doExport()} data-testid="export">
            {t("home.export")}
          </button>
          <button className="button" onClick={() => fileInput.current?.click()}>
            {t("home.import")}
          </button>
          <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(e) => void doImport(e.target.files?.[0])} data-testid="import-file" />
        </div>
        {message && <p role="status">{message}</p>}
      </section>

      <footer className="muted small disclaimer">{t("app.disclaimer")}</footer>
      {showSettings && <SettingsSheet onClose={() => setShowSettings(false)} />}
    </div>
  );
}
