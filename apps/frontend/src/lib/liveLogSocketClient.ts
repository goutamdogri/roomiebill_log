import { config } from "../config";
import type {
  ConnectionStatus,
  WsClientMessage,
  WsServerMessage,
} from "../types/log";

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;
const PING_INTERVAL_MS = 25_000;
const RELEASE_GRACE_PERIOD_MS = 250;
const CLIENT_ID_STORAGE_KEY = "roomiebill.liveLogs.clientId";

type LiveLogSocketListener = {
  onMessage?: (message: WsServerMessage) => void;
  onStatusChange?: (status: ConnectionStatus) => void;
};

function getOrCreateClientId() {
  if (typeof window === "undefined") {
    return "server-render";
  }

  const existing = window.sessionStorage.getItem(CLIENT_ID_STORAGE_KEY);
  if (existing) return existing;

  const next =
    typeof window.crypto?.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  window.sessionStorage.setItem(CLIENT_ID_STORAGE_KEY, next);
  return next;
}

class LiveLogSocketClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<LiveLogSocketListener>();
  private reconnectAttempt = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | undefined;
  private pingInterval: ReturnType<typeof setInterval> | undefined;
  private releaseTimeout: ReturnType<typeof setTimeout> | undefined;
  private subscriberCount = 0;
  private shouldReconnect = false;
  private status: ConnectionStatus = "disconnected";
  private readonly clientId = getOrCreateClientId();

  getStatus() {
    return this.status;
  }

  acquire() {
    this.subscriberCount += 1;
    this.shouldReconnect = true;

    if (this.releaseTimeout) {
      clearTimeout(this.releaseTimeout);
      this.releaseTimeout = undefined;
    }

    this.connect();
  }

  release() {
    this.subscriberCount = Math.max(0, this.subscriberCount - 1);

    if (this.subscriberCount > 0) return;

    this.releaseTimeout = setTimeout(() => {
      if (this.subscriberCount === 0) {
        this.shutdown();
      }
    }, RELEASE_GRACE_PERIOD_MS);
  }

  subscribe(listener: LiveLogSocketListener) {
    this.listeners.add(listener);
    listener.onStatusChange?.(this.status);

    return () => {
      this.listeners.delete(listener);
    };
  }

  send(message: WsClientMessage) {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;

    this.ws.send(JSON.stringify(message));
    return true;
  }

  private connect = () => {
    if (!this.shouldReconnect) return;

    const readyState = this.ws?.readyState;
    if (
      readyState === WebSocket.OPEN ||
      readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    this.setStatus("connecting");

    const ws = new WebSocket(this.buildUrl());
    this.ws = ws;

    ws.onopen = () => {
      if (this.ws !== ws) return;

      this.reconnectAttempt = 0;
      this.setStatus("connected");
      this.startPingLoop();
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as WsServerMessage;
        for (const listener of this.listeners) {
          listener.onMessage?.(message);
        }
      } catch {
        console.error("[WS] Failed to parse message");
      }
    };

    ws.onerror = () => {
      if (this.ws !== ws) return;
      this.setStatus("error");
    };

    ws.onclose = () => {
      if (this.ws === ws) {
        this.ws = null;
      }

      this.stopPingLoop();

      if (!this.shouldReconnect || this.subscriberCount === 0) {
        this.setStatus("disconnected");
        return;
      }

      this.setStatus("disconnected");
      const delay = Math.min(
        RECONNECT_BASE_MS * 2 ** this.reconnectAttempt,
        RECONNECT_MAX_MS,
      );
      this.reconnectAttempt += 1;
      this.reconnectTimeout = setTimeout(this.connect, delay);
    };
  };

  private shutdown() {
    this.shouldReconnect = false;
    this.reconnectAttempt = 0;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = undefined;
    }

    if (this.releaseTimeout) {
      clearTimeout(this.releaseTimeout);
      this.releaseTimeout = undefined;
    }

    this.stopPingLoop();

    const ws = this.ws;
    this.ws = null;

    if (
      ws &&
      (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)
    ) {
      ws.close(1000, "Client released");
    }

    this.setStatus("disconnected");
  }

  private startPingLoop() {
    this.stopPingLoop();
    this.pingInterval = setInterval(() => {
      this.send({ type: "ping" });
    }, PING_INTERVAL_MS);
  }

  private stopPingLoop() {
    if (!this.pingInterval) return;

    clearInterval(this.pingInterval);
    this.pingInterval = undefined;
  }

  private setStatus(status: ConnectionStatus) {
    this.status = status;
    for (const listener of this.listeners) {
      listener.onStatusChange?.(status);
    }
  }

  private buildUrl() {
    const url = new URL(config.wsUrl, window.location.href);
    url.searchParams.set("clientId", this.clientId);
    return url.toString();
  }
}

export const liveLogSocketClient = new LiveLogSocketClient();
