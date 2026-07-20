import { useEffect, useRef, useState } from "react";
import { STATUS_OPTIONS, statusInfo, VideoStatus } from "../lib/status";

export default function StatusDropdown({
  status,
  onChange,
}: {
  status: string;
  onChange: (status: VideoStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = statusInfo(status);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition hover:brightness-110 ${current.className}`}
      >
        <span>{current.emoji}</span> {current.label}
        <span className="text-[9px] opacity-70">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-52 overflow-hidden rounded-lg border border-slate-700 bg-slate-900 py-1 shadow-xl">
          {STATUS_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-slate-800 ${
                o.value === status ? "text-slate-100" : "text-slate-300"
              }`}
            >
              <span>{o.emoji}</span> {o.label}
              {o.value === status && <span className="ml-auto text-brand-400">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
