import { useRef, useEffect, useCallback, useState, useMemo } from "react";
import { liveLogSocketClient } from "../lib/liveLogSocketClient";
import type {
  LogEntry,
  LogFilters,
  LogPair,
  RequestLog,
  ResponseLog,
  ConnectionStatus,
  WsClientMessage,
  WsServerMessage,
} from "../types/log";

const MAX_LOGS = 500;

interface UseLiveLogsReturn {
  logs: LogEntry[];
  pairs: LogPair[];
  status: ConnectionStatus;
  subscribe: (filters: LogFilters) => void;
  unsubscribe: () => void;
  fetchHistory: (cursor?: number | null, filters?: LogFilters) => void;
  clearLogs: () => void;
  historyCursor: number | null;
  hasMore: boolean;
  isLoadingHistory: boolean;
  activeFilters: LogFilters;
  isPaused: boolean;
  togglePause: () => void;
}

export function useLiveLogs(): UseLiveLogsReturn {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>(
    liveLogSocketClient.getStatus(),
  );
  const [historyCursor, setHistoryCursor] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [activeFilters, setActiveFilters] = useState<LogFilters>({});
  const [isPaused, setIsPaused] = useState(false);

  // Buffer for logs received while paused
  const pausedBuffer = useRef<LogEntry[]>([]);
  const isPausedRef = useRef(false);
  const activeFiltersRef = useRef<LogFilters>({});

  const togglePause = useCallback(() => {
    setIsPaused((prev) => {
      const next = !prev;
      isPausedRef.current = next;
      if (!next && pausedBuffer.current.length > 0) {
        // Flush buffered logs
        setLogs((existing) => {
          const combined = [...pausedBuffer.current, ...existing];
          pausedBuffer.current = [];
          return combined.slice(0, MAX_LOGS);
        });
      }
      return next;
    });
  }, []);

  const send = useCallback((data: WsClientMessage) => {
    liveLogSocketClient.send(data);
  }, []);

  const subscribe = useCallback(
    (filters: LogFilters) => {
      activeFiltersRef.current = filters;
      setActiveFilters(filters);
      send({ type: "subscribe", filters });
    },
    [send],
  );

  const unsubscribe = useCallback(() => {
    activeFiltersRef.current = {};
    setActiveFilters({});
    send({ type: "unsubscribe" });
  }, [send]);

  const fetchHistory = useCallback(
    (cursor?: number | null, filters?: LogFilters) => {
      setIsLoadingHistory(true);
      send({
        type: "fetch_history",
        cursor: cursor ?? undefined,
        limit: 50,
        filters: filters ?? activeFilters,
      });
    },
    [send, activeFilters],
  );

  const clearLogs = useCallback(() => {
    setLogs([]);
    setHistoryCursor(null);
    setHasMore(false);
  }, []);

  // const logIncomingPayload = useCallback((source: string, entries: LogEntry[]) => {
  //   for (const entry of entries) {
  //     if (entry.log_type === "request") {
  //       console.log("[LiveLogs] request payload", { source, data: entry });
  //     } else {
  //       console.log("[LiveLogs] response payload", { source, data: entry });
  //     }
  //   }
  // }, []);

  useEffect(() => {
    const unsubscribeListener = liveLogSocketClient.subscribe({
      onStatusChange: (nextStatus) => {
        setStatus(nextStatus);
        if (nextStatus !== "connected") {
          setIsLoadingHistory(false);
          return;
        }

        const filters = activeFiltersRef.current;
        if (Object.keys(filters).length > 0) {
          send({ type: "subscribe", filters });
        }
      },
      onMessage: (msg: WsServerMessage) => {
        switch (msg.type) {
          case "initial_logs":
            // logIncomingPayload("initial_logs", msg.data);
            setLogs(msg.data);
            if (msg.data.length > 0) {
              setHistoryCursor(msg.data[msg.data.length - 1].id);
              setHasMore(true);
            } else {
              setHistoryCursor(null);
              setHasMore(false);
            }
            break;

          case "log":
            {
              const normalizedLog: LogEntry =
                msg.logType === "request"
                  ? { ...msg.data, log_type: "request" }
                  : { ...msg.data, log_type: "response" };

              // logIncomingPayload("live_log", [normalizedLog]);

              if (isPausedRef.current) {
                pausedBuffer.current.unshift(normalizedLog);
                if (pausedBuffer.current.length > MAX_LOGS) {
                  pausedBuffer.current = pausedBuffer.current.slice(0, MAX_LOGS);
                }
              } else {
                setLogs((prev) => [normalizedLog, ...prev].slice(0, MAX_LOGS));
              }
            }
            break;

          case "history":
            // logIncomingPayload("history", msg.data);
            setLogs((prev) => {
              const existingIds = new Set(prev.map((l) => `${l.log_type}-${l.id}`));
              const newEntries = msg.data.filter(
                (l) => !existingIds.has(`${l.log_type}-${l.id}`),
              );
              return [...prev, ...newEntries].slice(0, MAX_LOGS);
            });
            setHistoryCursor(msg.nextCursor);
            setHasMore(msg.hasMore);
            setIsLoadingHistory(false);
            break;

          case "subscribed":
            activeFiltersRef.current = msg.filters;
            setActiveFilters(msg.filters);
            break;

          case "unsubscribed":
            activeFiltersRef.current = {};
            setActiveFilters({});
            break;

          case "error":
            console.error("[WS] Server error:", msg.message);
            setIsLoadingHistory(false);
            break;

          default:
            break;
        }
      },
    });

    liveLogSocketClient.acquire();

    return () => {
      unsubscribeListener();
      liveLogSocketClient.release();
    };
  }, [send]);

  // ── Derive request-response pairs from flat log array ──
  const pairs = useMemo<LogPair[]>(() => {
    const map = new Map<string, LogPair>();

    for (const log of logs) {
      const rid = log.request_id;
      if (!map.has(rid)) {
        map.set(rid, {
          requestId: rid,
          request: null,
          response: null,
          timestamp: log.timestamp ?? log.created_at,
        });
      }
      const pair = map.get(rid)!;
      if (log.log_type === "request") {
        pair.request = log as RequestLog;
      } else {
        pair.response = log as ResponseLog;
      }
      // Use the earliest timestamp for sorting
      const ts = log.timestamp ?? log.created_at;
      if (ts && new Date(ts) < new Date(pair.timestamp)) {
        pair.timestamp = ts;
      }
    }

    return Array.from(map.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }, [logs]);

  return {
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
  };
}
