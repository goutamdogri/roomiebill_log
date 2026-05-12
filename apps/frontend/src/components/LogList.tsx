import { useRef, useEffect, useCallback } from "react";
import type { LogPair } from "../types/log";
import { LogPairRow } from "./LogPairRow";

interface LogListProps {
  pairs: LogPair[];
  hasMore: boolean;
  isLoadingHistory: boolean;
  onLoadMore: () => void;
  isPaused: boolean;
}

export function LogList({ pairs, hasMore, isLoadingHistory, onLoadMore, isPaused }: LogListProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries;
      if (entry.isIntersecting && hasMore && !isLoadingHistory) {
        onLoadMore();
      }
    },
    [hasMore, isLoadingHistory, onLoadMore],
  );

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(handleObserver, {
      root: null,
      rootMargin: "200px",
      threshold: 0,
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [handleObserver]);

  if (pairs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-bg-elevated">
          <svg className="h-8 w-8 text-t-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
        </div>
        <p className="text-sm text-t-secondary">No logs yet</p>
        <p className="mt-1 text-xs text-t-muted">Logs will appear here in real-time</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Column headers */}
      <div className="hidden items-center px-4 md:grid md:grid-cols-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-t-muted">Request</span>
        <span className="text-[10px] font-semibold uppercase tracking-widest text-t-muted">Response</span>
      </div>

      {/* Paused banner */}
      {isPaused && (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-accent-primary/20 bg-accent-primary/5 px-4 py-2">
          <svg className="h-4 w-4 text-accent-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-xs text-accent-primary">Live stream paused — new logs are buffered</span>
        </div>
      )}

      {pairs.map((pair) => (
        <LogPairRow key={pair.requestId} pair={pair} />
      ))}

      <div ref={sentinelRef} className="h-1" />

      {isLoadingHistory && (
        <div className="flex items-center justify-center py-6">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent-primary/30 border-t-accent-primary" />
          <span className="ml-2 text-xs text-t-muted">Loading more…</span>
        </div>
      )}

      {!hasMore && pairs.length > 0 && (
        <p className="py-4 text-center text-xs text-t-muted">End of logs</p>
      )}
    </div>
  );
}
