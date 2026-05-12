import type { LogEntry, RequestLog } from "../types/log";

/**
 * Format an ISO timestamp into a human-readable relative or absolute string.
 */
export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (isNaN(date.getTime())) return "—";

  const now = Date.now();
  const diff = now - date.getTime();

  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Format a full timestamp for tooltips.
 */
export function formatFullTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });
}

/**
 * Get status color class based on HTTP status code.
 */
export function getStatusColor(code: number): string {
  if (code < 300) return "text-status-success";
  if (code < 400) return "text-accent-amber";
  if (code < 500) return "text-status-warning";
  return "text-status-error";
}

/**
 * Get status badge bg class.
 */
export function getStatusBgColor(code: number): string {
  if (code < 300) return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
  if (code < 400) return "bg-amber-500/10 text-amber-400 border-amber-500/20";
  if (code < 500) return "bg-orange-500/10 text-orange-400 border-orange-500/20";
  return "bg-red-500/10 text-red-400 border-red-500/20";
}

/**
 * Get method color classes.
 */
export function getMethodColor(method: string): string {
  const m = method.toUpperCase();
  switch (m) {
    case "GET":
      return "bg-cyan-500/10 text-cyan-400 border-cyan-500/20";
    case "POST":
      return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    case "PUT":
    case "PATCH":
      return "bg-amber-500/10 text-amber-400 border-amber-500/20";
    case "DELETE":
      return "bg-red-500/10 text-red-400 border-red-500/20";
    default:
      return "bg-violet-500/10 text-violet-400 border-violet-500/20";
  }
}

/**
 * Get the effective timestamp from a log entry.
 */
export function getLogTimestamp(log: LogEntry): string {
  return log.timestamp ?? log.created_at;
}

/**
 * Get a human-friendly label for a log entry.
 */
export function getLogSummary(log: LogEntry): string {
  if (log.log_type === "request") {
    const req = log as RequestLog;
    return `${req.method} ${req.url}`;
  }
  return `${log.status_code} ${log.status_type ?? ""}`.trim();
}

/**
 * Format duration in ms to a human readable string.
 */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1) return "<1ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Truncate long strings with ellipsis.
 */
export function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max) + "…";
}
