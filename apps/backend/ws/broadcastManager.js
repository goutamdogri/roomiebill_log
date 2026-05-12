/**
 * BroadcastManager
 *
 * Manages WebSocket client connections and handles filtered broadcasting
 * of log entries. Each client can subscribe with optional filters so they
 * only receive logs that match their criteria.
 */

const { WebSocket } = require("ws");

class BroadcastManager {
  constructor() {
    /** @type {Map<WebSocket, { filters: object|null, isAlive: boolean, clientId: string|null }>} */
    this.clients = new Map();
  }

  // ─── Client lifecycle ───────────────────────────────────────────────

  addClient(ws, options = {}) {
    this.clients.set(ws, {
      filters: null,
      isAlive: true,
      clientId: options.clientId || null,
    });
  }

  removeClient(ws) {
    this.clients.delete(ws);
  }

  markAlive(ws) {
    const client = this.clients.get(ws);
    if (client) client.isAlive = true;
  }

  findClientById(clientId) {
    if (!clientId) return null;

    for (const [ws, meta] of this.clients) {
      if (meta.clientId === clientId) {
        return ws;
      }
    }

    return null;
  }

  get clientCount() {
    return this.clients.size;
  }

  // ─── Filter management ─────────────────────────────────────────────

  /**
   * Set subscription filters for a client.
   *
   * Supported filter keys:
   *   logType      – "request" | "response"  (omit for both)
   *   userId       – exact match on user_id
   *   email        – exact match on email
   *   method       – exact match on HTTP method (case-insensitive)
   *   url          – substring match on URL
   *   requestId    – exact match on request_id
   *   statusCode   – exact match on status_code  (response only)
   *   statusType   – exact match on status_type  (response only)
   *   search       – substring search across all string fields
   *   startDate    – ISO string, logs after this time
   *   endDate      – ISO string, logs before this time
   */
  updateFilters(ws, filters) {
    const client = this.clients.get(ws);
    if (client) client.filters = filters;
  }

  clearFilters(ws) {
    const client = this.clients.get(ws);
    if (client) client.filters = null;
  }

  // ─── Broadcasting ──────────────────────────────────────────────────

  /**
   * Broadcast a log entry to every connected client whose filters match.
   *
   * @param {object} logData  – The log row from the database.
   * @param {"request"|"response"} logType
   */
  broadcast(logData, logType) {
    const message = JSON.stringify({
      type: "log",
      logType,
      data: logData,
      timestamp: new Date().toISOString(),
    });

    for (const [ws, client] of this.clients) {
      if (ws.readyState !== WebSocket.OPEN) continue;

      try {
        if (this._matchesFilters(logData, logType, client.filters)) {
          ws.send(message);
        }
      } catch (err) {
        console.error("[BroadcastManager] Send error:", err.message);
      }
    }
  }

  // ─── Private helpers ───────────────────────────────────────────────

  /**
   * Return true if `logData` passes the client's filters.
   * A null / empty filter set matches everything.
   */
  _matchesFilters(logData, logType, filters) {
    if (!filters || Object.keys(filters).length === 0) return true;

    // Log-type filter
    if (filters.logType && filters.logType !== logType) return false;

    // Time-range filters
    const ts = logData.timestamp || logData.created_at;
    if (ts) {
      if (filters.startDate && new Date(ts) < new Date(filters.startDate))
        return false;
      if (filters.endDate && new Date(ts) > new Date(filters.endDate))
        return false;
    }

    // Request-specific filters
    if (logType === "request") {
      if (filters.userId && logData.user_id !== filters.userId) return false;
      if (filters.email && logData.email !== filters.email) return false;
      if (
        filters.method &&
        logData.method?.toUpperCase() !== filters.method.toUpperCase()
      )
        return false;
      if (filters.url && !logData.url?.includes(filters.url)) return false;
      if (filters.requestId && logData.request_id !== filters.requestId)
        return false;
    }

    // Response-specific filters
    if (logType === "response") {
      if (filters.requestId && logData.request_id !== filters.requestId)
        return false;
      if (
        filters.statusCode &&
        logData.status_code !== Number(filters.statusCode)
      )
        return false;
      if (filters.statusType && logData.status_type !== filters.statusType)
        return false;
    }

    // Full-text search across all string values
    if (filters.search) {
      const needle = filters.search.toLowerCase();
      const haystack = Object.values(logData)
        .filter((v) => typeof v === "string")
        .map((v) => v.toLowerCase());

      if (!haystack.some((field) => field.includes(needle))) return false;
    }

    return true;
  }
}

module.exports = new BroadcastManager();
