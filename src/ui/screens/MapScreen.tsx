import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ActionBody } from "../../game/actions";
import { isLastRound } from "../../game/selectors";
import { planStrategy } from "../../game/strategy";
import { cityById, routeById } from "../../data/lookup";
import { usePlan } from "../../store/planStore";
import { StrategySheet } from "../components/StrategySheet";
import { canUndo, useGame } from "../../store/gameStore";
import { useSettings } from "../../store/settingsStore";
import { ScoreSheet } from "../components/ScoreSheet";
import { TicketsSheet } from "../components/TicketsSheet";
import { SettingsSheet } from "../components/SettingsSheet";
import { Sheet } from "../components/Sheet";
import { useWakeLock } from "../hooks/useWakeLock";
import { ClaimPicker } from "../map/ClaimPicker";
import type { PlanOverlay } from "../map/MapContent";
import { MapView } from "../map/MapView";
import { StationSheet } from "../map/StationSheet";

type Panel = "score" | "menu" | "settings" | "tickets" | "strategy" | null;

export function MapScreen() {
  const { t } = useTranslation();
  const { state, actions, dispatch, undo, go, closeGame } = useGame();
  const colorBlind = useSettings((s) => s.colorBlind);
  const readOnly = state.ended;

  const [rotated, setRotated] = useState(false);
  const [resetSignal, setResetSignal] = useState(0);
  const [candidates, setCandidates] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [cityId, setCityId] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [planOn, setPlanOn] = useState(false);
  const [focusRoute, setFocusRoute] = useState<string | null>(null);
  const plan = useMemo(() => planStrategy(state), [state]);
  const { change, observe, dismiss } = usePlan();
  useEffect(() => observe(plan, state), [plan, state, observe]);
  const changeText = change
    ? t("strategy.changed", {
        routes: change.taken
          .map((id) => {
            const r = routeById.get(id)!;
            return `${cityById.get(r.from)?.name} – ${cityById.get(r.to)?.name}`;
          })
          .join(", "),
      })
    : null;
  const overlay = useMemo<PlanOverlay | null>(() => {
    if (!plan || (!planOn && !focusRoute)) return null;
    return {
      routes: planOn ? plan.routes.map((r) => r.route.id) : [],
      borrowed: planOn ? plan.borrowed : [],
      stations: planOn ? plan.stations.filter((s) => !s.existing).map((s) => s.city) : [],
      focus: focusRoute,
    };
  }, [plan, planOn, focusRoute]);

  useWakeLock(!readOnly);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const closePickers = useCallback(() => {
    setCandidates([]);
    setSelected(null);
    setCityId(null);
  }, []);

  const apply = (body: ActionBody) => {
    const error = dispatch(body);
    if (error) setToast(t(`errors.${error}`));
    else closePickers();
  };

  const onRoutesTap = useCallback(
    (ids: string[]) => {
      setFocusRoute(null);
      if (readOnly) return;
      setCityId(null);
      setCandidates(ids);
      setSelected(ids.length === 1 ? ids[0] : null);
    },
    [readOnly],
  );

  const onCityLongPress = useCallback(
    (id: string) => {
      if (readOnly) return;
      setCandidates([]);
      setSelected(null);
      setCityId(id);
    },
    [readOnly],
  );

  const endGame = () => {
    if (!window.confirm(t("game.endConfirm"))) return;
    if (!dispatch({ type: "GAME_ENDED" })) {
      setPanel(null);
      go("summary");
    }
  };

  return (
    <div className="screen map-screen">
      {isLastRound(state) && !readOnly && (
        <div className="banner warn top-banner" role="status" data-testid="last-round">
          {t("game.lastRound")}
        </div>
      )}
      {readOnly && (
        <div className="banner top-banner" role="status">
          {t("game.readOnly")}
        </div>
      )}

      <div className="map-area">
        <MapView
          state={state}
          rotated={rotated}
          colorBlind={colorBlind}
          selectedRouteId={selected}
          plan={overlay}
          resetSignal={resetSignal}
          onRoutesTap={onRoutesTap}
          onCityLongPress={onCityLongPress}
        />
        {changeText && !readOnly && panel !== "strategy" && (
          <div className="plan-note" role="status" data-testid="plan-note">
            <button className="plan-note-text" onClick={() => setPanel("strategy")}>
              {changeText}
            </button>
            <button className="icon-button" aria-label={t("common.close")} onClick={dismiss} data-testid="plan-note-dismiss">
              ✕
            </button>
          </div>
        )}
        {toast && (
          <div className="toast" role="alert" data-testid="toast">
            {toast}
          </div>
        )}
      </div>

      <nav className="toolbar" aria-label="Toolbar">
        <button className="tool" onClick={() => setRotated((r) => !r)} data-testid="rotate">
          <span aria-hidden="true">⟳</span>
          {t("game.rotate")}
        </button>
        <button className="tool" onClick={() => setResetSignal((n) => n + 1)} data-testid="fit">
          <span aria-hidden="true">⤢</span>
          {t("game.fit")}
        </button>
        {readOnly ? (
          <button className="tool" onClick={() => go("summary")} data-testid="summary">
            <span aria-hidden="true">≡</span>
            {t("game.summary")}
          </button>
        ) : (
          <button className="tool" onClick={undo} disabled={!canUndo(actions)} data-testid="undo">
            <span aria-hidden="true">↶</span>
            {t("game.undo")}
          </button>
        )}
        <button className="tool" onClick={() => setPanel("score")} data-testid="score">
          <span aria-hidden="true">★</span>
          {t("game.score")}
        </button>
        <button className="tool" onClick={() => setPanel("menu")} data-testid="menu">
          <span aria-hidden="true">☰</span>
          {t("game.menu")}
        </button>
      </nav>

      {(candidates.length > 0 || selected) && !readOnly && (
        <ClaimPicker
          state={state}
          candidates={candidates}
          selected={selected}
          onSelect={setSelected}
          onAction={apply}
          onClose={closePickers}
        />
      )}
      {cityId && !readOnly && <StationSheet state={state} cityId={cityId} onAction={apply} onClose={closePickers} />}
      {panel === "score" && <ScoreSheet state={state} onClose={() => setPanel(null)} />}
      {panel === "settings" && <SettingsSheet onClose={() => setPanel(null)} />}
      {panel === "tickets" && (
        <TicketsSheet state={state} readOnly={readOnly} onAction={(body) => void dispatch(body)} onClose={() => setPanel(null)} />
      )}
      {panel === "strategy" && (
        <StrategySheet
          plan={plan}
          change={change}
          focusId={focusRoute}
          overlayOn={planOn}
          onFocus={(id) => {
            setFocusRoute(id);
            if (id) setPlanOn(true);
          }}
          onToggleOverlay={() => setPlanOn((on) => !on)}
          onShowMap={() => setPanel(null)}
          onDismissChange={dismiss}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === "menu" && (
        <Sheet title={t("game.menu")} onClose={() => setPanel(null)} testId="menu-sheet">
          <p className="muted">{t("game.hint")}</p>
          <ul className="list">
            <li>
              <button
                className="row-button"
                onClick={() => {
                  setResetSignal((n) => n + 1);
                  setPanel(null);
                }}
              >
                {t("game.resetView")}
              </button>
            </li>
            <li>
              <button className="row-button" onClick={() => setPanel("tickets")} data-testid="open-tickets">
                {t("game.tickets")}
              </button>
            </li>
            <li>
              <button className="row-button" onClick={() => setPanel("strategy")} data-testid="open-strategy">
                {t("game.strategy")}
              </button>
            </li>
            <li>
              <button className="row-button" onClick={() => setPlanOn((on) => !on)} role="switch" aria-checked={planOn} data-testid="toggle-plan">
                {planOn ? t("strategy.overlayHide") : t("strategy.overlayShow")}
              </button>
            </li>
            <li>
              <button className="row-button" onClick={() => setPanel("settings")}>
                {t("settings.title")}
              </button>
            </li>
            {!readOnly && (
              <li>
                <button className="row-button" onClick={endGame} data-testid="end-game">
                  {t("game.endGame")}
                </button>
              </li>
            )}
            <li>
              <button className="row-button" onClick={closeGame} data-testid="home">
                {t("game.home")}
              </button>
            </li>
          </ul>
        </Sheet>
      )}
    </div>
  );
}
