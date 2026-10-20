import { useTranslation } from "react-i18next";
import { cityById, routeById, ticketById } from "../../data/lookup";
import type { Route } from "../../data/types";
import { STATION_BONUS } from "../../game/actions";
import type { PlanChange, PlannedRoute, StrategyPlan } from "../../game/strategy";
import { ColorDot } from "./ColorDot";
import { Sheet } from "./Sheet";

const cityName = (id: string) => cityById.get(id)?.name ?? id;
const routeName = (r: Route) => `${cityName(r.from)} – ${cityName(r.to)}`;
const ticketName = (id: string) => {
  const t = ticketById.get(id)!;
  return `${cityName(t.from)} – ${cityName(t.to)}`;
};

interface Props {
  plan: StrategyPlan | null;
  change: PlanChange | null;
  focusId: string | null;
  overlayOn: boolean;
  onFocus: (routeId: string | null) => void;
  onToggleOverlay: () => void;
  onShowMap: () => void;
  onDismissChange: () => void;
  onClose: () => void;
}

export function StrategySheet({ plan, change, focusId, overlayOn, onFocus, onToggleOverlay, onShowMap, onDismissChange, onClose }: Props) {
  const { t } = useTranslation();
  return (
    <Sheet title={t("strategy.title")} onClose={onClose} testId="strategy-sheet">
      {!plan ? (
        <p className="muted" data-testid="strategy-empty">
          {t("strategy.empty")}
        </p>
      ) : (
        <>
          {change && (
            <div className="banner warn plan-change" role="status" data-testid="plan-change">
              <div>
                <div>
                  {t("strategy.changed", { routes: change.taken.map((id) => routeName(routeById.get(id)!)).join(", ") })}
                </div>
                {change.added.length > 0 && (
                  <div className="small">{t("strategy.changedAdded", { routes: change.added.map((id) => routeName(routeById.get(id)!)).join(", ") })}</div>
                )}
                {change.newStations.length > 0 && (
                  <div className="small">
                    {t("strategy.changedStation", { cities: change.newStations.map((s) => cityName(s.city)).join(", ") })}
                  </div>
                )}
                {change.blocked.length > 0 && (
                  <div className="small">{t("strategy.changedBlocked", { tickets: change.blocked.map(ticketName).join(", ") })}</div>
                )}
              </div>
              <button className="icon-button" aria-label={t("common.close")} onClick={onDismissChange} data-testid="plan-change-dismiss">
                ✕
              </button>
            </div>
          )}

          <Summary plan={plan} overlayOn={overlayOn} onToggleOverlay={onToggleOverlay} />
          <TicketList plan={plan} />
          <RouteList plan={plan} focusId={focusId} onFocus={onFocus} />
          {focusId && (
            <button className="button primary" onClick={onShowMap} data-testid="plan-show-map">
              {t("strategy.showOnMap")}
            </button>
          )}
          <Cards plan={plan} />
          <Stations plan={plan} />
          <p className="muted small">{t("strategy.note")}</p>
        </>
      )}
    </Sheet>
  );
}

function Summary({ plan, overlayOn, onToggleOverlay }: { plan: StrategyPlan; overlayOn: boolean; onToggleOverlay: () => void }) {
  const { t } = useTranslation();
  return (
    <section>
      <p data-testid="plan-trains" data-fits={plan.fits}>
        <strong>{t("strategy.trains", { needed: plan.trainsNeeded, left: plan.trainsLeft })}</strong>
        {plan.shared > 0 && <span className="muted small"> · {t("strategy.shared", { count: plan.shared })}</span>}
      </p>
      {!plan.fits && (
        <p className="banner warn" data-testid="plan-nofit">
          {t("strategy.noFit")}
          {plan.dropSuggestion && ` ${t("strategy.dropHint", { ticket: ticketName(plan.dropSuggestion) })}`}
        </p>
      )}
      {plan.tight && (
        <p className="banner warn" data-testid="plan-tight">
          {t("strategy.tight", { pct: Math.round(plan.share * 100) })}
        </p>
      )}
      <button className="button" role="switch" aria-checked={overlayOn} onClick={onToggleOverlay} data-testid="plan-overlay-toggle">
        {overlayOn ? t("strategy.overlayHide") : t("strategy.overlayShow")}
      </button>
    </section>
  );
}

function TicketList({ plan }: { plan: StrategyPlan }) {
  const { t } = useTranslation();
  return (
    <section>
      <h3>{t("strategy.ticketsTitle")}</h3>
      <ul className="list" data-testid="plan-tickets">
        {plan.tickets.map((p) => (
          <li key={p.ticket.id} className="card ticket-row" data-testid={`plan-ticket-${p.ticket.id}`}>
            <div>
              <strong>{ticketName(p.ticket.id)}</strong> <span className="muted small">{t("tickets.points", { n: p.ticket.points })}</span>
              <div className="small" data-testid={`plan-ticket-status-${p.ticket.id}`}>
                {p.completed
                  ? `✓ ${t("tickets.done")}`
                  : p.blocked
                    ? t("tickets.blocked")
                    : `${t("tickets.toPlace", { count: p.trains })}${p.borrowed.length ? ` · ${t("tickets.withStation")}` : ""}`}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RouteList({ plan, focusId, onFocus }: { plan: StrategyPlan; focusId: string | null; onFocus: (id: string | null) => void }) {
  const { t } = useTranslation();
  return (
    <section>
      <h3>{t("strategy.routesTitle")}</h3>
      {plan.routes.length === 0 ? (
        <p className="muted small">{t("strategy.noRoutes")}</p>
      ) : (
        <>
          <p className="muted small">{t("strategy.orderHint")}</p>
          <ol className="list plan-routes" data-testid="plan-routes">
            {plan.routes.map((p, i) => (
              <li key={p.route.id}>
                <button
                  className={`row-button plan-route${focusId === p.route.id ? " selected" : ""}`}
                  aria-pressed={focusId === p.route.id}
                  onClick={() => onFocus(focusId === p.route.id ? null : p.route.id)}
                  data-testid={`plan-route-${p.route.id}`}
                >
                  <span className="plan-order">{i + 1}</span>
                  <ColorDot kind="route" color={p.route.color} size="s" />
                  <span className="plan-route-text">
                    <strong>{routeName(p.route)}</strong>
                    <span className="small muted">{routeFacts(p, t)}</span>
                    {p.reasons.length > 0 && <span className="small">{p.reasons.map((r) => t(`strategy.reason.${r}`)).join(" · ")}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

function routeFacts(p: PlannedRoute, t: ReturnType<typeof useTranslation>["t"]): string {
  const parts = [t("strategy.cardsFor", { n: p.route.length, color: p.color === "gray" ? t("strategy.anyColor") : t(`colors.${p.color}`) })];
  if (p.tunnel) parts.push(t("strategy.tunnelExtra"));
  if (p.locomotives > 0) parts.push(t("strategy.locomotives", { count: p.locomotives }));
  return parts.join(" · ");
}

function Cards({ plan }: { plan: StrategyPlan }) {
  const { t } = useTranslation();
  const { byColor, anyColor, locomotives, tunnels } = plan.cards;
  const entries = Object.entries(byColor);
  if (plan.routes.length === 0) return null;
  return (
    <section data-testid="plan-cards">
      <h3>{t("strategy.cardsTitle")}</h3>
      <ul className="chips">
        {entries.map(([color, n]) => (
          <li key={color} className="chip">
            <ColorDot kind="route" color={color as Route["color"]} size="s" /> {n}
          </li>
        ))}
        {anyColor > 0 && <li className="chip">{t("strategy.anyCards", { count: anyColor })}</li>}
        {locomotives > 0 && <li className="chip">{t("strategy.locomotives", { count: locomotives })}</li>}
      </ul>
      {tunnels > 0 && <p className="small muted">{t("strategy.tunnelWarning", { count: tunnels })}</p>}
    </section>
  );
}

function Stations({ plan }: { plan: StrategyPlan }) {
  const { t } = useTranslation();
  if (plan.stations.length === 0) return null;
  return (
    <section data-testid="plan-stations">
      <h3>{t("tickets.stationsTitle")}</h3>
      <ul className="small">
        {plan.stations.map((s) => (
          <li key={s.route}>
            {t("tickets.stationLine", { city: cityName(s.city), route: routeName(routeById.get(s.route)!) })} (
            {s.existing ? t("tickets.stationHave") : t("tickets.stationNew", { points: STATION_BONUS })})
          </li>
        ))}
      </ul>
    </section>
  );
}
