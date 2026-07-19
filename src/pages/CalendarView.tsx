import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, CalendarEvent } from "../lib/api";

type DayEvent = {
  kind: "created" | "completed";
  event: CalendarEvent;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function toKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function CalendarView() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  useEffect(() => {
    api.getCalendar().then((e) => {
      setEvents(e);
      setLoading(false);
    });
  }, []);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, DayEvent[]>();
    for (const ev of events) {
      if (ev.created_date) {
        const list = map.get(ev.created_date) || [];
        list.push({ kind: "created", event: ev });
        map.set(ev.created_date, list);
      }
      if (ev.completed_date) {
        const list = map.get(ev.completed_date) || [];
        list.push({ kind: "completed", event: ev });
        map.set(ev.completed_date, list);
      }
    }
    return map;
  }, [events]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startWeekday = firstOfMonth.getDay();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  const todayKey = toKey(new Date());
  const selectedEvents = selectedDay ? eventsByDay.get(selectedDay) || [] : [];

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Calendar</h1>
          <p className="text-sm text-slate-400">
            Every day you started or finished a video, across all clients.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCursor(new Date(year, month - 1, 1))}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
          >
            ← Prev
          </button>
          <span className="min-w-[9rem] text-center text-sm font-medium text-slate-200">
            {MONTH_NAMES[month]} {year}
          </span>
          <button
            onClick={() => setCursor(new Date(year, month + 1, 1))}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
          >
            Next →
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-slate-400">Loading...</p>
      ) : (
        <>
          <div className="mb-2 flex items-center gap-4 text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-brand-400" /> Created
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400" /> Completed
            </span>
          </div>

          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-slate-800 bg-slate-800">
            {WEEKDAYS.map((w) => (
              <div key={w} className="bg-slate-900 px-2 py-2 text-center text-xs font-medium text-slate-500">
                {w}
              </div>
            ))}
            {cells.map((date, i) => {
              if (!date) return <div key={i} className="min-h-[5.5rem] bg-slate-950" />;
              const key = toKey(date);
              const dayEvents = eventsByDay.get(key) || [];
              const isToday = key === todayKey;
              const isSelected = key === selectedDay;
              return (
                <button
                  key={i}
                  onClick={() => setSelectedDay(dayEvents.length ? key : null)}
                  className={`min-h-[5.5rem] bg-slate-900 p-2 text-left transition hover:bg-slate-800 ${
                    isSelected ? "ring-1 ring-inset ring-brand-500" : ""
                  }`}
                >
                  <span
                    className={`text-xs ${
                      isToday
                        ? "rounded-full bg-brand-600 px-1.5 py-0.5 font-semibold text-white"
                        : "text-slate-400"
                    }`}
                  >
                    {date.getDate()}
                  </span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {dayEvents.slice(0, 4).map((de, idx) => (
                      <span
                        key={idx}
                        className={`h-1.5 w-1.5 rounded-full ${
                          de.kind === "created" ? "bg-brand-400" : "bg-emerald-400"
                        }`}
                      />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>

          {selectedDay && (
            <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900 p-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-100">
                {new Date(selectedDay + "T00:00:00").toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </h2>
              <ul className="space-y-2">
                {selectedEvents.map((de, idx) => (
                  <li key={idx} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          de.kind === "created" ? "bg-brand-400" : "bg-emerald-400"
                        }`}
                      />
                      <span className="text-slate-300">
                        {de.kind === "created" ? "Created" : "Completed"}{" "}
                        <Link
                          to={`/clients/${de.event.client_id}/projects/${de.event.id}`}
                          className="font-medium text-slate-100 hover:text-brand-300"
                        >
                          {de.event.name}
                        </Link>
                      </span>
                    </span>
                    <span className="text-slate-500">{de.event.client_name}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
