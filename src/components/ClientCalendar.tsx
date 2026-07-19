import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Project } from "../lib/api";

type DayEvent = { kind: "created" | "completed"; project: Project };

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
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

export default function ClientCalendar({ clientId, projects }: { clientId: string; projects: Project[] }) {
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, DayEvent[]>();
    for (const p of projects) {
      if (p.created_date) {
        const list = map.get(p.created_date) || [];
        list.push({ kind: "created", project: p });
        map.set(p.created_date, list);
      }
      if (p.completed_date) {
        const list = map.get(p.completed_date) || [];
        list.push({ kind: "completed", project: p });
        map.set(p.completed_date, list);
      }
    }
    return map;
  }, [projects]);

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
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-100">Activity</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCursor(new Date(year, month - 1, 1))}
            className="rounded border border-slate-700 px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-800"
          >
            ←
          </button>
          <span className="min-w-[6.5rem] text-center text-xs font-medium text-slate-300">
            {MONTH_NAMES[month]} {year}
          </span>
          <button
            onClick={() => setCursor(new Date(year, month + 1, 1))}
            className="rounded border border-slate-700 px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-800"
          >
            →
          </button>
        </div>
      </div>

      <div className="mb-2 flex items-center gap-3 text-[11px] text-slate-400">
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-400" /> Created
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Completed
        </span>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w, i) => (
          <div key={i} className="text-center text-[10px] font-medium text-slate-500">
            {w}
          </div>
        ))}
        {cells.map((date, i) => {
          if (!date) return <div key={i} />;
          const key = toKey(date);
          const dayEvents = eventsByDay.get(key) || [];
          const isToday = key === todayKey;
          const isSelected = key === selectedDay;
          return (
            <button
              key={i}
              onClick={() => setSelectedDay(dayEvents.length ? key : null)}
              className={`flex aspect-square flex-col items-center justify-center rounded-md text-xs transition hover:bg-slate-800 ${
                isSelected ? "ring-1 ring-inset ring-brand-500" : ""
              } ${isToday ? "bg-brand-600 font-semibold text-white" : "text-slate-300"}`}
            >
              {date.getDate()}
              <div className="mt-0.5 flex gap-0.5">
                {dayEvents.slice(0, 3).map((de, idx) => (
                  <span
                    key={idx}
                    className={`h-1 w-1 rounded-full ${
                      de.kind === "created" ? "bg-brand-400" : "bg-emerald-400"
                    } ${isToday ? "bg-white" : ""}`}
                  />
                ))}
              </div>
            </button>
          );
        })}
      </div>

      {selectedDay && (
        <div className="mt-4 border-t border-slate-800 pt-3">
          <p className="mb-2 text-xs font-medium text-slate-400">
            {new Date(selectedDay + "T00:00:00").toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </p>
          <ul className="space-y-1.5">
            {selectedEvents.map((de, idx) => (
              <li key={idx} className="flex items-center gap-2 text-xs">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${de.kind === "created" ? "bg-brand-400" : "bg-emerald-400"}`}
                />
                <span className="text-slate-400">{de.kind === "created" ? "Created" : "Completed"}</span>
                <Link
                  to={`/clients/${clientId}/projects/${de.project.id}`}
                  className="font-medium text-slate-200 hover:text-brand-300"
                >
                  {de.project.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
