import type { ConnectionStatus } from "../types/log";

interface ConnectionBadgeProps {
  status: ConnectionStatus;
}

const statusConfig: Record<
  ConnectionStatus,
  { label: string; dotClass: string; textClass: string; bgClass: string }
> = {
  connected: {
    label: "Live",
    dotClass: "bg-status-success animate-pulse-dot",
    textClass: "text-status-success",
    bgClass: "bg-status-success/10 border-status-success/20",
  },
  connecting: {
    label: "Connecting",
    dotClass: "bg-accent-primary animate-pulse-dot",
    textClass: "text-accent-primary",
    bgClass: "bg-accent-primary/10 border-accent-primary/20",
  },
  disconnected: {
    label: "Disconnected",
    dotClass: "bg-status-error",
    textClass: "text-status-error",
    bgClass: "bg-status-error/10 border-status-error/20",
  },
  error: {
    label: "Error",
    dotClass: "bg-status-error",
    textClass: "text-status-error",
    bgClass: "bg-status-error/10 border-status-error/20",
  },
};

export function ConnectionBadge({ status }: ConnectionBadgeProps) {
  const cfg = statusConfig[status];

  return (
    <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 ${cfg.bgClass}`}>
      <span className={`h-2 w-2 rounded-full ${cfg.dotClass}`} />
      <span className={`text-xs font-medium ${cfg.textClass}`}>{cfg.label}</span>
    </div>
  );
}
