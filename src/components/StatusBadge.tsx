const STYLES: Record<string, string> = {
  in_progress: "bg-amber-100 text-amber-700",
  review: "bg-blue-100 text-blue-700",
  delivered: "bg-emerald-100 text-emerald-700",
};

const LABELS: Record<string, string> = {
  in_progress: "In Progress",
  review: "In Review",
  delivered: "Delivered",
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[status] || "bg-slate-100 text-slate-600"}`}>
      {LABELS[status] || status}
    </span>
  );
}
