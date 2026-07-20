import { statusInfo } from "../lib/status";

export default function StatusBadge({ status }: { status: string }) {
  const info = statusInfo(status);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${info.className}`}>
      <span>{info.emoji}</span> {info.label}
    </span>
  );
}
