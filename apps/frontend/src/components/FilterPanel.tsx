import { useState, useCallback, type FormEvent } from "react";
import type { LogFilters } from "../types/log";

interface FilterPanelProps {
  activeFilters: LogFilters;
  onApply: (filters: LogFilters) => void;
  onClear: () => void;
}

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

const FILTER_LABELS: Record<keyof LogFilters, string> = {
  logType: "Log Type",
  search: "Search",
  method: "Method",
  url: "URL",
  requestId: "Request ID",
  statusCode: "Status Code",
  statusType: "Status Type",
  userId: "User ID",
  email: "Email",
  startDate: "From",
  endDate: "To",
};

export function FilterPanel({ activeFilters, onApply, onClear }: FilterPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [filters, setFilters] = useState<LogFilters>(activeFilters);

  const updateFilter = useCallback(
    <K extends keyof LogFilters>(key: K, value: LogFilters[K]) => {
      setFilters((prev) => ({ ...prev, [key]: value || undefined }));
    },
    [],
  );

  const handleApply = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const cleaned: LogFilters = {};
      for (const [key, val] of Object.entries(filters)) {
        if (val && val !== "all") {
          (cleaned as Record<string, string>)[key] = val;
        }
      }
      onApply(cleaned);
    },
    [filters, onApply],
  );

  const handleClear = useCallback(() => {
    setFilters({});
    onClear();
  }, [onClear]);

  /** Remove a single active filter and immediately re-apply */
  const removeFilter = useCallback(
    (key: keyof LogFilters) => {
      const next = { ...activeFilters };
      delete next[key];
      setFilters(next);
      onApply(next);
    },
    [activeFilters, onApply],
  );

  const activeEntries = Object.entries(activeFilters).filter(
    ([, v]) => v && v !== "all",
  ) as [keyof LogFilters, string][];

  const inputClass =
    "w-full rounded-lg border border-b-default bg-bg-input px-3.5 py-2.5 text-sm text-t-primary placeholder-t-muted outline-none transition-colors focus:border-accent-secondary/50 focus:ring-1 focus:ring-accent-secondary/20";
  const labelClass = "mb-1.5 block text-xs font-medium text-t-secondary";

  return (
    <div className="card rounded-xl">
      {/* Toggle Header */}
      <button
        id="filter-toggle"
        type="button"
        onClick={() => setIsExpanded((p) => !p)}
        className="flex w-full items-center justify-between px-5 py-3.5 text-left transition-colors hover:bg-bg-card-hover"
      >
        <div className="flex items-center gap-3">
          <svg className="h-4 w-4 text-t-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          <span className="text-sm font-medium text-t-primary">Filters</span>
          {activeEntries.length > 0 && (
            <span className="rounded-full bg-accent-secondary/15 px-2 py-0.5 text-xs font-medium text-accent-secondary">
              {activeEntries.length}
            </span>
          )}
        </div>
        <svg
          className={`h-4 w-4 text-t-muted transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* ── Active filter tags (always visible when filters are active) ── */}
      {activeEntries.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-b-default px-5 py-3">
          {activeEntries.map(([key, value]) => (
            <span
              key={key}
              className="inline-flex items-center gap-1.5 rounded-full border border-accent-secondary/20 bg-accent-secondary/10 px-2.5 py-1 text-xs text-accent-secondary"
            >
              <span className="font-medium">{FILTER_LABELS[key]}:</span>
              <span className="max-w-[160px] truncate">{value}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeFilter(key);
                }}
                className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full transition-colors hover:bg-accent-secondary/20"
                aria-label={`Remove ${FILTER_LABELS[key]} filter`}
              >
                <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      {/* ── Expanded filter form ── */}
      {isExpanded && (
        <form onSubmit={handleApply} className="animate-fade-in border-t border-b-default px-5 pb-5 pt-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <div className="sm:col-span-2 lg:col-span-3 xl:col-span-4">
              <label className={labelClass}>Full-text Search</label>
              <input id="filter-search" type="text" placeholder="Search across all fields…" value={filters.search ?? ""} onChange={(e) => updateFilter("search", e.target.value)} className={inputClass} />
            </div>

            <div>
              <label className={labelClass}>Log Type</label>
              <select id="filter-log-type" value={filters.logType ?? "all"} onChange={(e) => updateFilter("logType", e.target.value as LogFilters["logType"])} className={inputClass}>
                <option value="all">All</option>
                <option value="request">Request</option>
                <option value="response">Response</option>
              </select>
            </div>

            <div>
              <label className={labelClass}>HTTP Method</label>
              <select id="filter-method" value={filters.method ?? ""} onChange={(e) => updateFilter("method", e.target.value)} className={inputClass}>
                <option value="">Any</option>
                {HTTP_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            <div>
              <label className={labelClass}>URL</label>
              <input id="filter-url" type="text" placeholder="/api/..." value={filters.url ?? ""} onChange={(e) => updateFilter("url", e.target.value)} className={inputClass} />
            </div>

            <div>
              <label className={labelClass}>Request ID</label>
              <input id="filter-request-id" type="text" placeholder="uuid..." value={filters.requestId ?? ""} onChange={(e) => updateFilter("requestId", e.target.value)} className={inputClass} />
            </div>

            <div>
              <label className={labelClass}>Status Code</label>
              <input id="filter-status-code" type="text" placeholder="200, 404, 500…" value={filters.statusCode ?? ""} onChange={(e) => updateFilter("statusCode", e.target.value)} className={inputClass} />
            </div>

            <div>
              <label className={labelClass}>Status Type</label>
              <input id="filter-status-type" type="text" placeholder="success, error…" value={filters.statusType ?? ""} onChange={(e) => updateFilter("statusType", e.target.value)} className={inputClass} />
            </div>

            <div>
              <label className={labelClass}>User ID</label>
              <input id="filter-user-id" type="text" placeholder="User ID" value={filters.userId ?? ""} onChange={(e) => updateFilter("userId", e.target.value)} className={inputClass} />
            </div>

            <div>
              <label className={labelClass}>Email</label>
              <input id="filter-email" type="text" placeholder="user@example.com" value={filters.email ?? ""} onChange={(e) => updateFilter("email", e.target.value)} className={inputClass} />
            </div>

            <div>
              <label className={labelClass}>Start Date</label>
              <input id="filter-start-date" type="datetime-local" value={filters.startDate ?? ""} onChange={(e) => updateFilter("startDate", e.target.value)} className={inputClass} />
            </div>

            <div>
              <label className={labelClass}>End Date</label>
              <input id="filter-end-date" type="datetime-local" value={filters.endDate ?? ""} onChange={(e) => updateFilter("endDate", e.target.value)} className={inputClass} />
            </div>
          </div>

          <div className="mt-5 flex items-center gap-3">
            <button
              id="filter-apply-btn"
              type="submit"
              className="rounded-lg bg-accent-primary px-5 py-2 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.97] cursor-pointer"
            >
              Apply Filters
            </button>
            <button
              id="filter-clear-btn"
              type="button"
              onClick={handleClear}
              className="rounded-lg border border-b-default px-5 py-2 text-sm font-medium text-t-secondary transition-colors hover:border-b-hover hover:text-t-primary cursor-pointer"
            >
              Clear All
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
