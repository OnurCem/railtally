import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { cityById, routeById, ticketById } from "../../data/lookup";
import { tickets } from "../../data/tickets";
import type { Ticket } from "../../data/types";
import { evaluateTicket, explain, isCompleted, pathContext, rankOptions, type Option } from "../../game/tickets";
import type { GameState } from "../../game/state";
import type { ActionBody } from "../../game/actions";
import { STATION_BONUS } from "../../game/actions";
import { Sheet } from "./Sheet";

type Mode = "start" | "draw" | "add";
type View = { name: "list" } | { name: "pick"; mode: Mode } | { name: "result"; offered: string[]; minKeep: number };

/** What may be selected: `long` / `short` are exact counts (null = any number); the rules deal 1 long + 3 short at the start. */
const MODE: Record<Mode, { long: number | null; short: number | null; minKeep: number }> = {
  start: { long: 1, short: 3, minKeep: 2 },
  draw: { long: 0, short: 3, minKeep: 1 },
  add: { long: null, short: null, minKeep: 0 },
};

const FOLD: Record<string, string> = { ø: "o", æ: "ae", å: "a", ł: "l", đ: "d", ß: "ss", ı: "i" };
/** Lower-case without accents, so "kobenhavn" finds "København" and "zurich" finds "Zürich". */
const plain = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[øæåłđßı]/g, (c) => FOLD[c]);
const cityName = (id: string) => cityById.get(id)?.name ?? id;
const label = (t: Ticket) => `${cityName(t.from)} – ${cityName(t.to)}`;

interface Props {
  state: GameState;
  readOnly: boolean;
  onAction: (body: ActionBody) => void;
  onClose: () => void;
}

export function TicketsSheet({ state, readOnly, onAction, onClose }: Props) {
  const { t } = useTranslation();
  const [view, setView] = useState<View>({ name: "list" });
  return (
    <Sheet title={t("tickets.title")} onClose={onClose} testId="tickets-sheet">
      {view.name === "list" && <HeldList state={state} readOnly={readOnly} onAction={onAction} onPick={(mode) => setView({ name: "pick", mode })} />}
      {view.name === "pick" && (
        <Picker
          state={state}
          mode={view.mode}
          onCancel={() => setView({ name: "list" })}
          onDone={(ids) => {
            if (view.mode === "add") {
              ids.forEach((ticketId) => onAction({ type: "TICKET_ADDED", ticketId }));
              setView({ name: "list" });
            } else setView({ name: "result", offered: ids, minKeep: MODE[view.mode].minKeep });
          }}
        />
      )}
      {view.name === "result" && (
        <Result
          state={state}
          offered={view.offered}
          minKeep={view.minKeep}
          onBack={() => setView({ name: "pick", mode: view.minKeep === 2 ? "start" : "draw" })}
          onKeep={(option) => {
            option.keep.forEach((ticketId) => onAction({ type: "TICKET_ADDED", ticketId }));
            setView({ name: "list" });
          }}
        />
      )}
    </Sheet>
  );
}

function HeldList({ state, readOnly, onAction, onPick }: { state: GameState; readOnly: boolean; onAction: (b: ActionBody) => void; onPick: (m: Mode) => void }) {
  const { t } = useTranslation();
  const ctx = pathContext(state);
  return (
    <>
      {state.myTickets.length === 0 && <p className="muted">{t("tickets.empty")}</p>}
      <ul className="list" data-testid="held-tickets">
        {state.myTickets.map((id) => {
          const ticket = ticketById.get(id)!;
          const e = evaluateTicket(ticket, ctx);
          const done = isCompleted(state, ticket);
          return (
            <li key={id} className="card ticket-row" data-testid={`held-${id}`}>
              <div>
                <strong>{label(ticket)}</strong>{" "}
                <span className="muted small">
                  {t("tickets.points", { n: ticket.points })}
                  {ticket.long ? ` · ${t("tickets.long")}` : ""}
                </span>
                <div className="small" data-testid={`status-${id}`}>
                  {done
                    ? `✓ ${t("tickets.done")}`
                    : !e.path
                      ? t("tickets.blocked")
                      : `${t("tickets.toPlace", { count: e.trains })}${e.path.borrowed.length ? ` · ${t("tickets.withStation")}` : ""}`}
                </div>
              </div>
              {!readOnly && (
                <button className="icon-button" aria-label={t("tickets.remove")} onClick={() => onAction({ type: "TICKET_REMOVED", ticketId: id })}>
                  🗑
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {!readOnly && (
        <div className="stack">
          <button className="button primary" onClick={() => onPick("start")} data-testid="mode-start">
            {t("tickets.modeStart")}
          </button>
          <button className="button" onClick={() => onPick("draw")} data-testid="mode-draw">
            {t("tickets.modeDraw")}
          </button>
          <button className="button" onClick={() => onPick("add")} data-testid="mode-add">
            {t("tickets.modeAdd")}
          </button>
        </div>
      )}
    </>
  );
}

function Picker({ state, mode, onCancel, onDone }: { state: GameState; mode: Mode; onCancel: () => void; onDone: (ids: string[]) => void }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const rule = MODE[mode];
  const available = useMemo(
    () => tickets.filter((tk) => !state.myTickets.includes(tk.id) && !(tk.long && rule.long === 0)),
    [state.myTickets, rule.long],
  );
  const q = plain(query.trim());
  const shown = available.filter((tk) => !q || plain(label(tk)).includes(q));
  const longCount = selected.filter((id) => ticketById.get(id)!.long).length;
  const shortCount = selected.length - longCount;
  const full = (tk: Ticket) => (tk.long ? rule.long !== null && longCount >= rule.long : rule.short !== null && shortCount >= rule.short);
  const toggle = (tk: Ticket) => setSelected((list) => (list.includes(tk.id) ? list.filter((x) => x !== tk.id) : full(tk) ? list : [...list, tk.id]));
  const ready = rule.short === null ? selected.length > 0 : longCount === rule.long && shortCount === rule.short;
  const counter =
    rule.short === null
      ? t("tickets.selectedFree", { n: selected.length })
      : rule.long === 0
        ? t("tickets.selectedShort", { n: shortCount, max: rule.short })
        : t("tickets.selectedStart", { long: longCount, short: shortCount });

  return (
    <>
      <p className="muted">{t(`tickets.hint_${mode}`)}</p>
      <input
        type="search"
        className="search"
        placeholder={t("tickets.search")}
        aria-label={t("tickets.search")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        data-testid="ticket-search"
      />
      <p className="small" data-testid="selected-count">
        {counter}
      </p>
      <ul className="list ticket-list" data-testid="ticket-options">
        {shown.map((tk) => {
          const on = selected.includes(tk.id);
          return (
            <li key={tk.id}>
              <button
                className={on ? "row-button selected" : "row-button"}
                aria-pressed={on}
                disabled={!on && full(tk)}
                onClick={() => toggle(tk)}
                data-testid={`option-${tk.id}`}
              >
                <span>{on ? "✓ " : ""}{label(tk)}</span>
                <span className="muted small">
                  {t("tickets.points", { n: tk.points })}
                  {tk.long ? ` · ${t("tickets.long")}` : ""}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="button-row">
        <button className="button" onClick={onCancel}>
          {t("common.back")}
        </button>
        <button className="button primary" disabled={!ready} onClick={() => onDone(selected)} data-testid="ticket-next">
          {mode === "add" ? t("tickets.add") : t("tickets.recommend")}
        </button>
      </div>
    </>
  );
}

function Result({ state, offered, minKeep, onBack, onKeep }: { state: GameState; offered: string[]; minKeep: number; onBack: () => void; onKeep: (o: Option) => void }) {
  const { t } = useTranslation();
  const options = useMemo(() => rankOptions(state, offered, minKeep), [state, offered, minKeep]);
  const best = options[0];
  const why = useMemo(() => explain(state, offered, best), [state, offered, best]);
  const [chosen, setChosen] = useState(0);
  const option = options[chosen];

  return (
    <>
      <p className="muted small">{t("tickets.mustKeep", { count: Math.min(minKeep, offered.length) })}</p>
      <section className="card" data-testid="recommendation">
        <h3>{chosen === 0 ? t("tickets.best") : t("tickets.alternative", { n: chosen + 1 })}</h3>
        <ul className="list">
          {offered.map((id) => {
            const ticket = ticketById.get(id)!;
            const e = option.tickets.find((x) => x.ticket.id === id);
            const keep = option.keep.includes(id);
            const verdict = chosen === 0 ? why.get(id) : undefined;
            return (
              <li key={id} data-testid={`verdict-${id}`} data-keep={keep}>
                <strong>
                  {keep ? "✓" : "✗"} {label(ticket)}
                </strong>{" "}
                <span className="muted small">{t("tickets.points", { n: ticket.points })}</span>
                <div className="small">
                  {keep ? t("tickets.keep") : t("tickets.giveBack")}
                  {e?.path ? ` · ${t("tickets.facts", { trains: e.trains, pct: Math.round(e.success * 100) })}` : ` · ${t("tickets.blocked")}`}
                </div>
                {verdict && <div className="muted small">{t(`tickets.why.${verdict}`)}</div>}
              </li>
            );
          })}
        </ul>
        <p className="small" data-testid="network">
          {t("tickets.network", {
            trains: option.trains,
            shared: option.shared,
            points: option.points,
            chance: Math.round(option.chanceAll * 100),
          })}
        </p>
        {option.stations.length > 0 && (
          <div data-testid="stations">
            <h4>{t("tickets.stationsTitle")}</h4>
            <ul className="small">
              {option.stations.map((s) => {
                const r = routeById.get(s.route)!;
                return (
                  <li key={s.route}>
                    {t("tickets.stationLine", { city: cityName(s.city), route: `${cityName(r.from)} – ${cityName(r.to)}` })} (
                    {s.existing ? t("tickets.stationHave") : t("tickets.stationNew", { points: STATION_BONUS })})
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {!option.feasible && <p className="banner warn">{t("tickets.tooManyTrains")}</p>}
        <button className="button primary" onClick={() => onKeep(option)} data-testid="keep-these">
          {t("tickets.apply")}
        </button>
      </section>

      {options.length > 1 && (
        <section>
          <h3>{t("tickets.otherChoices")}</h3>
          <ul className="list">
            {options.slice(0, 4).map((o, i) =>
              i === chosen ? null : (
                <li key={o.keep.join("+")}>
                  <button className="row-button" onClick={() => setChosen(i)} data-testid={`alt-${i}`}>
                    <span>{o.keep.map((id) => label(ticketById.get(id)!)).join(" + ")}</span>
                    <span className="muted small">{t("tickets.altFacts", { trains: o.trains, points: o.points })}</span>
                  </button>
                </li>
              ),
            )}
          </ul>
        </section>
      )}
      <p className="muted small">{t("tickets.note")}</p>
      <button className="button" onClick={onBack}>
        {t("common.back")}
      </button>
    </>
  );
}
