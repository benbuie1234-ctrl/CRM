const STYLES: Record<string, string> = {
  in_progress: "bg-amber-500/10 text-amber-400",
  review: "bg-blue-500/10 text-blue-400",
  delivered: "bg-emerald-500/100/10 text-emerald-400",
};

const LABELS: Record<string, string> = {
  in_progress: "In Progress",
  review: "In Review",
  delivered: "Delivered",
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[status] || "bg-slate-800 text-slate-300"}`}>
      {LABELS[status] || status}
    </span>
  );
}
