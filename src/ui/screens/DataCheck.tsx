import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { cities } from "../../data/cities";
import { cityById } from "../../data/lookup";
import { routes } from "../../data/routes";
import { tickets } from "../../data/tickets";
import type { Route } from "../../data/types";

/** Hidden screen (#data) for comparing the app's route and ticket data with the physical board. */
export function DataCheck({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();

  const doubles = useMemo(() => {
    const ids = new Set<string>();
    for (const r of routes) if (r.doubleOf) ids.add(r.id).add(r.doubleOf);
    return ids;
  }, []);

  const byCity = useMemo(
    () =>
      cities.map((city) => ({
        city,
        routes: routes
          .filter((r) => r.from === city.id || r.to === city.id)
          .map((r) => ({ route: r, other: r.from === city.id ? r.to : r.from }))
          .sort((a, b) => cityName(a.other).localeCompare(cityName(b.other)) || a.route.id.localeCompare(b.route.id)),
      })),
    [],
  );

  const sortedTickets = useMemo(
    () => [...tickets].sort((a, b) => Number(b.long) - Number(a.long) || cityName(a.from).localeCompare(cityName(b.from))),
    [],
  );

  const marks = (r: Route) =>
    [
      r.tunnel && t("dataCheck.tunnel"),
      r.ferryLocomotives > 0 && t("dataCheck.ferry", { count: r.ferryLocomotives }),
      doubles.has(r.id) && t("dataCheck.double"),
    ]
      .filter(Boolean)
      .join(", ");

  return (
    <div className="screen page data-check" data-testid="data-check">
      <header className="page-header">
        <button className="button no-print" onClick={onBack} data-testid="data-back">
          ← {t("common.back")}
        </button>
        <h1>{t("dataCheck.title")}</h1>
        <button className="button no-print" onClick={() => window.print()}>
          {t("dataCheck.print")}
        </button>
      </header>
      <p className="muted">{t("dataCheck.intro")}</p>
      <p data-testid="data-totals">
        {t("dataCheck.totals", {
          cities: cities.length,
          routes: routes.length,
          trains: routes.reduce((n, r) => n + r.length, 0),
          tickets: tickets.length,
        })}
      </p>

      <section>
        <h2>{t("dataCheck.cities")}</h2>
        {byCity.map(({ city, routes: list }) => (
          <div key={city.id} className="data-city" data-testid={`data-city-${city.id}`}>
            <h3>
              {city.name} <span className="muted small">({list.length})</span>
            </h3>
            <table>
              <tbody>
                {list.map(({ route, other }) => (
                  <tr key={route.id}>
                    <td>{cityName(other)}</td>
                    <td className="num">{route.length}</td>
                    <td>{route.color === "gray" ? t("dataCheck.gray") : t(`colors.${route.color}`)}</td>
                    <td>{marks(route)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </section>

      <section>
        <h2>{t("dataCheck.tickets")}</h2>
        <table data-testid="data-tickets">
          <thead>
            <tr>
              <th>{t("dataCheck.from")}</th>
              <th>{t("dataCheck.to")}</th>
              <th className="num">{t("dataCheck.points")}</th>
              <th>{t("dataCheck.kind")}</th>
            </tr>
          </thead>
          <tbody>
            {sortedTickets.map((tk) => (
              <tr key={tk.id}>
                <td>{cityName(tk.from)}</td>
                <td>{cityName(tk.to)}</td>
                <td className="num">{tk.points}</td>
                <td>{tk.long ? t("dataCheck.long") : t("dataCheck.short")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

const cityName = (id: string) => cityById.get(id)?.name ?? id;
