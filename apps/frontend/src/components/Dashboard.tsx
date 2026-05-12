import { useCallback } from "react";
import { useLiveLogs } from "../hooks/useLiveLogs";
import { ConnectionBadge } from "./ConnectionBadge";
import { FilterPanel } from "./FilterPanel";
import { LogList } from "./LogList";
import { StatsBar } from "./StatsBar";
import { ThemeToggle } from "./ThemeToggle";
import type { LogFilters } from "../types/log";
import { useTheme } from "../context/ThemeContext";

export function Dashboard() {
  const {
    logs,
    pairs,
    status,
    subscribe,
    unsubscribe,
    fetchHistory,
    clearLogs,
    historyCursor,
    hasMore,
    isLoadingHistory,
    activeFilters,
    isPaused,
    togglePause,
  } = useLiveLogs();

  const { theme } = useTheme();
  const isDark = theme === "dark";

  const handleApplyFilters = useCallback(
    (filters: LogFilters) => {
      subscribe(filters);
    },
    [subscribe],
  );

  const handleClearFilters = useCallback(() => {
    unsubscribe();
  }, [unsubscribe]);

  const handleLoadMore = useCallback(() => {
    if (historyCursor != null) fetchHistory(historyCursor);
  }, [fetchHistory, historyCursor]);

  return (
    <div className="min-h-screen bg-bg-primary transition-colors duration-300">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-4">
            <img
              src={isDark ? "/green-white.png" : "/green-black.png"}
              alt="RoomieBill Logo"
              className="w-10"
            />
            <div>
              <h1 className="text-2xl align-text-bottom font-bold tracking-tight">
                <span className="text-roomiebill-primary">RoomieBill</span>{" "}
                <span className="text-t-primary">Logger</span>
              </h1>
              <p className="mt-1 text-sm text-t-muted">
                Real-time observability
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <ConnectionBadge status={status} />

            {/* Pause / Resume */}
            <button
              id="pause-toggle-btn"
              type="button"
              onClick={togglePause}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                isPaused
                  ? "border-accent-primary/30 bg-accent-primary/10 text-accent-primary"
                  : "border-b-default text-t-secondary hover:border-b-hover hover:text-t-primary"
              }`}
              title={isPaused ? "Resume live stream" : "Pause live stream"}
            >
              {isPaused ? (
                <svg
                  className="h-3.5 w-3.5"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
              ) : (
                <svg
                  className="h-3.5 w-3.5"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              )}
              {isPaused ? "Resume" : "Pause"}
            </button>

            {/* Clear */}
            <button
              id="clear-logs-btn"
              type="button"
              onClick={clearLogs}
              className="inline-flex items-center gap-1.5 rounded-full border border-b-default px-3 py-1.5 text-xs font-medium text-t-secondary transition-colors hover:border-status-error/30 hover:bg-status-error/10 hover:text-status-error cursor-pointer"
              title="Clear all logs"
            >
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
              Clear
            </button>

            {/* Theme Toggle */}
            <ThemeToggle />
          </div>
        </header>

        {/* Stats */}
        <section className="mb-6" aria-label="Log Statistics">
          <StatsBar logs={logs} />
        </section>

        {/* Filters */}
        <section className="mb-6" aria-label="Log Filters">
          <FilterPanel
            activeFilters={activeFilters}
            onApply={handleApplyFilters}
            onClear={handleClearFilters}
          />
        </section>

        {/* Log Stream */}
        <section aria-label="Log Stream">
          <LogList
            pairs={pairs}
            hasMore={hasMore}
            isLoadingHistory={isLoadingHistory}
            onLoadMore={handleLoadMore}
            isPaused={isPaused}
          />
        </section>
      </div>
    </div>
  );
}
