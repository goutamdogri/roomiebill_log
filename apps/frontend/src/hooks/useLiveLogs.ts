import { useRef, useEffect, useCallback, useState, useMemo } from "react";
import { config } from "../config";
import type {
  LogEntry,
  LogFilters,
  LogPair,
  RequestLog,
  ResponseLog,
  ConnectionStatus,
  WsServerMessage,
} from "../types/log";

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;
const PING_INTERVAL_MS = 25_000;
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
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempt = useRef(0);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pingInterval = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [historyCursor, setHistoryCursor] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [activeFilters, setActiveFilters] = useState<LogFilters>({});
  const [isPaused, setIsPaused] = useState(false);

  // Buffer for logs received while paused
  const pausedBuffer = useRef<LogEntry[]>([]);
  const isPausedRef = useRef(false);

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

  const send = useCallback((data: object) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }, []);

  const subscribe = useCallback(
    (filters: LogFilters) => {
      setActiveFilters(filters);
      send({ type: "subscribe", filters });
    },
    [send],
  );

  const unsubscribe = useCallback(() => {
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

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus("connecting");
    const ws = new WebSocket(config.wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("connected");
      reconnectAttempt.current = 0;

      // Start keep-alive pings
      pingInterval.current = setInterval(() => {
        send({ type: "ping" });
      }, PING_INTERVAL_MS);
    };

    ws.onmessage = (event) => {
      try {
        const msg: WsServerMessage = JSON.parse(event.data);

        switch (msg.type) {
          case "initial_logs":
            setLogs(msg.data);
            if (msg.data.length > 0) {
              setHistoryCursor(msg.data[msg.data.length - 1].id);
              setHasMore(true);
            }
            break;

          case "log":
            if (isPausedRef.current) {
              pausedBuffer.current.unshift(msg.data);
              if (pausedBuffer.current.length > MAX_LOGS) {
                pausedBuffer.current = pausedBuffer.current.slice(0, MAX_LOGS);
              }
            } else {
              setLogs((prev) => [msg.data, ...prev].slice(0, MAX_LOGS));
            }
            break;

          case "history":
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
            setActiveFilters(msg.filters);
            break;

          case "unsubscribed":
            setActiveFilters({});
            break;

          case "error":
            console.error("[WS] Server error:", msg.message);
            setIsLoadingHistory(false);
            break;

          // connected, pong — no-op
        }
      } catch {
        console.error("[WS] Failed to parse message");
      }
    };

    ws.onclose = () => {
      setStatus("disconnected");
      clearInterval(pingInterval.current);
      wsRef.current = null;

      // Exponential backoff reconnect
      const delay = Math.min(
        RECONNECT_BASE_MS * 2 ** reconnectAttempt.current,
        RECONNECT_MAX_MS,
      );
      reconnectAttempt.current++;
      reconnectTimeout.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      setStatus("error");
    };
  }, [send]);

  useEffect(() => {
    connect();

    return () => {
      clearTimeout(reconnectTimeout.current);
      clearInterval(pingInterval.current);
      wsRef.current?.close();
    };
  }, [connect]);

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
