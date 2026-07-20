export type VideoStatus = "in_progress" | "review" | "delivered";

export const STATUS_OPTIONS: { value: VideoStatus; label: string; emoji: string; className: string }[] = [
  { value: "in_progress", label: "In Progress", emoji: "🛠️", className: "bg-amber-500/10 text-amber-400" },
  { value: "review", label: "Waiting for Review", emoji: "👀", className: "bg-blue-500/10 text-blue-400" },
  { value: "delivered", label: "Posted", emoji: "✅", className: "bg-emerald-500/10 text-emerald-400" },
];

export function statusInfo(status: string) {
  return STATUS_OPTIONS.find((o) => o.value === status) || STATUS_OPTIONS[0];
}
