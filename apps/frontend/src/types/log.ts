// ─── Log Data Types ─────────────────────────────────────────────────

export interface RequestLog {
  id: number;
  log_type: "request";
  request_id: string;
  user_id: string | null;
  email: string | null;
  method: string;
  url: string;
  headers: Record<string, string>;
  params: Record<string, unknown> | null;
  timestamp: string | null;
  created_at: string;
}

export interface ResponseLog {
  id: number;
  log_type: "response";
  request_id: string;
  status_type: string;
  status_code: number;
  response_message: string | null;
  duration: number | null;
  timestamp: string | null;
  created_at: string;
}

export type LogEntry = RequestLog | ResponseLog;

// ─── Filter Types ───────────────────────────────────────────────────

export interface LogFilters {
  logType?: "request" | "response" | "all";
  userId?: string;
  email?: string;
  method?: string;
  url?: string;
  requestId?: string;
  statusCode?: string;
  statusType?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
}

// ─── WebSocket Protocol ─────────────────────────────────────────────

// Client → Server
export type WsClientMessage =
  | { type: "subscribe"; filters: LogFilters }
  | { type: "unsubscribe" }
  | {
      type: "fetch_history";
      cursor?: number | null;
      limit?: number;
      filters?: LogFilters;
      logType?: string;
    }
  | { type: "ping" };

// Server → Client
export type WsServerMessage =
  | { type: "connected"; message: string; timestamp: string }
  | { type: "initial_logs"; data: LogEntry[]; count: number }
  | { type: "log"; logType: "request" | "response"; data: LogEntry; timestamp: string }
  | { type: "history"; data: LogEntry[]; nextCursor: number | null; hasMore: boolean }
  | { type: "subscribed"; filters: LogFilters; message: string }
  | { type: "unsubscribed"; message: string }
  | { type: "pong"; timestamp: string }
  | { type: "error"; message: string };

// ─── Connection State ───────────────────────────────────────────────

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

// ─── Request-Response Pair ──────────────────────────────────────────

export interface LogPair {
  requestId: string;
  request: RequestLog | null;
  response: ResponseLog | null;
  timestamp: string;
}
