/**
 * LiveLogServer
 *
 * Sets up a WebSocket server on the existing HTTP server at path /ws/logs.
 * Listens to PostgreSQL NOTIFY channels for real-time log inserts,
 * fetches the full row, and broadcasts to subscribed clients.
 *
 * Protocol (Client → Server):
 *   { type: "subscribe",      filters: { ... } }
 *   { type: "unsubscribe" }
 *   { type: "fetch_history",  cursor?: <id>, limit?: <n>, filters?: { ... } }
 *   { type: "ping" }
 *
 * Protocol (Server → Client):
 *   { type: "connected",      message, timestamp }
 *   { type: "initial_logs",   data: [...], count }
 *   { type: "log",            logType, data, timestamp }
 *   { type: "history",        data: [...], nextCursor, hasMore }
 *   { type: "subscribed",     filters, message }
 *   { type: "unsubscribed",   message }
 *   { type: "pong",           timestamp }
 *   { type: "error",          message }
 */

const { WebSocketServer, WebSocket } = require("ws");
const pool = require("../db");
const broadcastManager = require("./broadcastManager");

// ─── Constants ────────────────────────────────────────────────────────
const HEARTBEAT_INTERVAL_MS = 30_000;
const MAX_CONNECTIONS = 100;
const INITIAL_LOG_COUNT = 50;
const HISTORY_PAGE_SIZE = 50;
const MAX_HISTORY_PAGE_SIZE = 200;
const DUPLICATE_CONNECTION_CLOSE_CODE = 4009;

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Attach a WebSocket server to the given HTTP server.
 *
 * @param {import("http").Server} server
 * @returns {WebSocketServer}
 */
function initLiveLogServer(server) {
  const wss = new WebSocketServer({
    server,
    path: "/ws/logs",
    maxPayload: 64 * 1024, // 64 KB
    verifyClient: (_info, cb) => {
      if (broadcastManager.clientCount >= MAX_CONNECTIONS) {
        cb(false, 503, "Server at maximum capacity");
        return;
      }
      cb(true);
    },
  });

  // ── Heartbeat (ping/pong) to prune dead sockets ──
  const heartbeat = setInterval(() => {
    for (const [ws, meta] of broadcastManager.clients) {
      if (!meta.isAlive) {
        ws.terminate();
        broadcastManager.removeClient(ws);
        continue;
      }
      meta.isAlive = false;
      ws.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);

  wss.on("close", () => clearInterval(heartbeat));

  // ── New connection handler ──
  wss.on("connection", async (ws, req) => {
    const clientId = _getClientId(req);
    const ip =
      req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";

    const existingClient = broadcastManager.findClientById(clientId);
    if (existingClient && existingClient !== ws) {
      console.warn(
        `[WS] Duplicate client session detected for ${clientId} from ${ip}; closing previous connection`,
      );
      existingClient.close(
        DUPLICATE_CONNECTION_CLOSE_CODE,
        "Superseded by a newer connection",
      );
      broadcastManager.removeClient(existingClient);
    }

    console.log(
      `[WS] Client connected: ${ip}  (total: ${broadcastManager.clientCount + 1})`,
    );

    broadcastManager.addClient(ws, { clientId });

    // Welcome message
    _send(ws, {
      type: "connected",
      message: "Live logging active",
      timestamp: new Date().toISOString(),
    });

    // Send most-recent logs so the dashboard isn't empty on connect
    try {
      const rows = await _fetchRecentLogs(INITIAL_LOG_COUNT);
      _send(ws, { type: "initial_logs", data: rows, count: rows.length });
    } catch (err) {
      console.error("[WS] Failed to fetch initial logs:", err.message);
      _send(ws, { type: "error", message: "Failed to load initial logs" });
    }

    // Pong handler for heartbeat
    ws.on("pong", () => broadcastManager.markAlive(ws));

    // Incoming message handler
    ws.on("message", async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        await _handleMessage(ws, msg);
      } catch {
        _send(ws, { type: "error", message: "Invalid JSON" });
      }
    });

    ws.on("close", () => {
      console.log(
        `[WS] Client disconnected: ${ip}${clientId ? ` (${clientId})` : ""}`,
      );
      broadcastManager.removeClient(ws);
    });

    ws.on("error", (err) => {
      console.error(`[WS] Client error (${ip}):`, err.message);
      broadcastManager.removeClient(ws);
    });
  });

  // Start listening to PostgreSQL NOTIFY channels
  _initPgListener();

  console.log("[WS] Live log server initialised on /ws/logs");
  return wss;
}

function _getClientId(req) {
  try {
    const baseUrl = `ws://${req.headers.host || "localhost"}`;
    const url = new URL(req.url || "/ws/logs", baseUrl);
    const clientId = url.searchParams.get("clientId");
    return clientId && clientId.trim() ? clientId.trim() : null;
  } catch {
    return null;
  }
}

// ─── Message router ───────────────────────────────────────────────────

async function _handleMessage(ws, msg) {
  switch (msg.type) {
    case "subscribe":
      broadcastManager.updateFilters(ws, msg.filters || {});
      _send(ws, {
        type: "subscribed",
        filters: msg.filters,
        message: "Filters applied",
      });
      break;

    case "unsubscribe":
      broadcastManager.clearFilters(ws);
      _send(ws, {
        type: "unsubscribed",
        message: "Filters cleared — receiving all logs",
      });
      break;

    case "fetch_history":
      await _handleFetchHistory(ws, msg);
      break;

    case "ping":
      _send(ws, { type: "pong", timestamp: new Date().toISOString() });
      break;

    default:
      _send(ws, {
        type: "error",
        message: `Unknown message type: ${msg.type}`,
      });
  }
}

// ─── History fetch (cursor-based pagination) ──────────────────────────

async function _handleFetchHistory(ws, msg) {
  try {
    const {
      cursor,
      limit: rawLimit,
      filters = {},
      logType: requestedType,
    } = msg;

    const limit = Math.min(
      Math.max(parseInt(rawLimit) || HISTORY_PAGE_SIZE, 1),
      MAX_HISTORY_PAGE_SIZE,
    );

    // We fetch limit + 1 rows to know if there's a next page
    const fetchLimit = limit + 1;
    const type = requestedType || filters.logType || "all";
    let results = [];

    if (type === "all" || type === "request") {
      const rows = await _queryHistoryTable(
        "request_logs",
        "request",
        filters,
        cursor,
        fetchLimit,
      );
      results.push(...rows);
    }

    if (type === "all" || type === "response") {
      const rows = await _queryHistoryTable(
        "response_logs",
        "response",
        filters,
        cursor,
        fetchLimit,
      );
      results.push(...rows);
    }

    // Sort combined results descending by id (proxy for insertion order)
    // When mixing tables we sort by created_at then by id
    results.sort((a, b) => {
      const ta = new Date(a.created_at || a.timestamp).getTime();
      const tb = new Date(b.created_at || b.timestamp).getTime();
      if (tb !== ta) return tb - ta;
      return (b.id || 0) - (a.id || 0);
    });

    const hasMore = results.length > limit;
    const page = results.slice(0, limit);
    const nextCursor =
      hasMore && page.length > 0 ? page[page.length - 1].id : null;

    _send(ws, {
      type: "history",
      data: page,
      nextCursor,
      hasMore,
    });
  } catch (err) {
    console.error("[WS] History fetch error:", err.message);
    _send(ws, { type: "error", message: "Failed to fetch history" });
  }
}

/**
 * Build and execute a filtered, cursor-paginated query against a single
 * log table.
 */
async function _queryHistoryTable(table, logType, filters, cursor, limit) {
  const conditions = [];
  const values = [];
  let idx = 1;

  // Cursor-based pagination — fetch rows older than cursor id
  if (cursor) {
    conditions.push(`id < $${idx++}`);
    values.push(Number(cursor));
  }

  // ── Common filters ──
  if (filters.requestId) {
    conditions.push(`request_id = $${idx++}`);
    values.push(filters.requestId);
  }
  if (filters.startDate) {
    conditions.push(`timestamp >= $${idx++}`);
    values.push(new Date(filters.startDate));
  }
  if (filters.endDate) {
    conditions.push(`timestamp <= $${idx++}`);
    values.push(new Date(filters.endDate));
  }

  // ── Request-specific filters ──
  if (logType === "request") {
    if (filters.userId) {
      conditions.push(`user_id = $${idx++}`);
      values.push(filters.userId);
    }
    if (filters.email) {
      conditions.push(`email ILIKE $${idx++}`);
      values.push(`%${filters.email}%`);
    }
    if (filters.method) {
      conditions.push(`UPPER(method) = $${idx++}`);
      values.push(filters.method.toUpperCase());
    }
    if (filters.url) {
      conditions.push(`url ILIKE $${idx++}`);
      values.push(`%${filters.url}%`);
    }
    if (filters.search) {
      conditions.push(
        `(url ILIKE $${idx} OR method ILIKE $${idx} OR email ILIKE $${idx})`,
      );
      values.push(`%${filters.search}%`);
      idx++;
    }
  }

  // ── Response-specific filters ──
  if (logType === "response") {
    if (filters.statusCode) {
      conditions.push(`status_code = $${idx++}`);
      values.push(Number(filters.statusCode));
    }
    if (filters.statusType) {
      conditions.push(`status_type = $${idx++}`);
      values.push(filters.statusType);
    }
    if (filters.search) {
      conditions.push(
        `(response_message ILIKE $${idx} OR status_type ILIKE $${idx})`,
      );
      values.push(`%${filters.search}%`);
      idx++;
    }
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const query = `
    SELECT *, '${logType}' AS log_type
    FROM ${table}
    ${where}
    ORDER BY id DESC
    LIMIT $${idx}
  `;
  values.push(limit);

  const { rows } = await pool.query(query, values);
  return rows;
}

// ─── Fetch recent logs (for initial load) ────────────────────────────

async function _fetchRecentLogs(count) {
  // Pull the latest N rows from each table and merge
  const [reqResult, resResult] = await Promise.all([
    pool.query(
      `SELECT *, 'request' AS log_type FROM request_logs
       ORDER BY id DESC LIMIT $1`,
      [count],
    ),
    pool.query(
      `SELECT *, 'response' AS log_type FROM response_logs
       ORDER BY id DESC LIMIT $1`,
      [count],
    ),
  ]);

  const combined = [...reqResult.rows, ...resResult.rows];

  combined.sort((a, b) => {
    const ta = new Date(a.created_at || a.timestamp).getTime();
    const tb = new Date(b.created_at || b.timestamp).getTime();
    if (tb !== ta) return tb - ta;
    return (b.id || 0) - (a.id || 0);
  });

  return combined.slice(0, count);
}

// ─── PostgreSQL LISTEN / NOTIFY ──────────────────────────────────────

/**
 * Opens a dedicated long-lived PG connection that listens for new-log
 * notifications.  When a row is inserted the trigger sends only the
 * row id; we fetch the full row and broadcast it.
 */
async function _initPgListener() {
  try {
    const client = await pool.connect();

    client.on("notification", async (msg) => {
      try {
        const payload = JSON.parse(msg.payload);
        const { id } = payload;

        if (msg.channel === "new_request_log") {
          const { rows } = await pool.query(
            "SELECT * FROM request_logs WHERE id = $1",
            [id],
          );
          if (rows[0]) broadcastManager.broadcast(rows[0], "request");
        } else if (msg.channel === "new_response_log") {
          const { rows } = await pool.query(
            "SELECT * FROM response_logs WHERE id = $1",
            [id],
          );
          if (rows[0]) broadcastManager.broadcast(rows[0], "response");
        }
      } catch (err) {
        console.error(
          "[PG LISTEN] Error processing notification:",
          err.message,
        );
      }
    });

    await client.query("LISTEN new_request_log");
    await client.query("LISTEN new_response_log");

    console.log("[PG LISTEN] Subscribed to new_request_log, new_response_log");

    // Handle connection loss — attempt reconnect
    client.on("error", (err) => {
      console.error("[PG LISTEN] Connection error:", err.message);
      setTimeout(() => _initPgListener(), 5000);
    });
  } catch (err) {
    console.error("[PG LISTEN] Failed to connect:", err.message);
    setTimeout(() => _initPgListener(), 5000);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

function _send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

module.exports = { initLiveLogServer };
