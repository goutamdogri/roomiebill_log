import { useMemo } from "react";
import type { LogEntry, ResponseLog } from "../types/log";

interface StatsBarProps {
  logs: LogEntry[];
}

export function StatsBar({ logs }: StatsBarProps) {
  const stats = useMemo(() => {
    let requests = 0;
    let responses = 0;
    let errors = 0;
    let totalDuration = 0;
    let durationCount = 0;

    for (const log of logs) {
      if (log.log_type === "request") {
        requests++;
      } else {
        responses++;
        const res = log as ResponseLog;
        if (res.status_code >= 400) errors++;
        if (res.duration != null) {
          totalDuration += res.duration;
          durationCount++;
        }
      }
    }

    const avgDuration = durationCount > 0 ? totalDuration / durationCount : 0;
    return { requests, responses, errors, avgDuration, total: logs.length };
  }, [logs]);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <StatCard label="Total" value={stats.total} color="text-accent-primary" />
      <StatCard label="Requests" value={stats.requests} color="text-accent-secondary" />
      <StatCard label="Responses" value={stats.responses} color="text-accent-highlight" />
      <StatCard label="Errors" value={stats.errors} color="text-status-error" />
      <StatCard
        label="Avg Duration"
        value={stats.avgDuration > 0 ? `${Math.round(stats.avgDuration)}ms` : "—"}
        color="text-status-warning"
      />
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="card rounded-xl px-4 py-3">
      <span className="text-[11px] font-medium uppercase tracking-wider text-t-muted">{label}</span>
      <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
