const express = require("express");
const router = express.Router();
const pool = require("../db");

// ═══════════════════════════════════════════════════════════════════════
// CREATE LOGS
// ═══════════════════════════════════════════════════════════════════════

//
// 🔹 SAVE REQUEST LOG
//
router.post("/request", async (req, res) => {
  try {
    const { requestId, method, url, headers, params, timestamp, user } =
      req.body;

    if (!requestId || !method || !url || !headers) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    let parsedTimestamp = null;

    if (timestamp) {
      const temp = new Date(timestamp);
      parsedTimestamp = isNaN(temp.getTime()) ? null : temp;
    }

    await pool.query(
      `INSERT INTO request_logs 
      (request_id, user_id, email, method, url, headers, params, timestamp)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        requestId,
        user?.userId || null,
        user?.email || null,
        method,
        url,
        headers,
        params || null,
        parsedTimestamp,
      ],
    );

    res.sendStatus(201);
  } catch (err) {
    console.error("REQUEST LOG ERROR:", err);
    res.sendStatus(500);
  }
});

//
// 🔹 SAVE RESPONSE LOG
//
router.post("/response", async (req, res) => {
  try {
    const {
      requestId,
      status_type,
      statusCode,
      responseMessage,
      duration,
      timestamp,
    } = req.body;

    if (!requestId || !status_type || !statusCode) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    let parsedTimestamp = null;

    if (timestamp) {
      const temp = new Date(timestamp);
      parsedTimestamp = isNaN(temp.getTime()) ? null : temp;
    }

    await pool.query(
      `INSERT INTO response_logs 
      (request_id, status_type, status_code, response_message, duration, timestamp)
      VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        requestId,
        status_type,
        statusCode,
        responseMessage || null,
        duration || null,
        parsedTimestamp,
      ],
    );

    res.sendStatus(201);
  } catch (err) {
    console.error("RESPONSE LOG ERROR:", err);
    res.sendStatus(500);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// GET LOGS — unified history with cursor pagination & filters
// ═══════════════════════════════════════════════════════════════════════

//
// 🔹 GET /logs/history
//
// Query params:
//   logType     – "request" | "response" | "all" (default: "all")
//   cursor      – id of last item from previous page (for pagination)
//   limit       – page size, 1–200 (default: 50)
//   userId      – exact match (request logs)
//   email       – substring match (request logs)
//   method      – exact match, case-insensitive (request logs)
//   url         – substring match (request logs)
//   requestId   – exact match (both)
//   statusCode  – exact match (response logs)
//   statusType  – exact match (response logs)
//   search      – full-text substring across string columns
//   startDate   – ISO timestamp, inclusive lower bound
//   endDate     – ISO timestamp, inclusive upper bound
//
// Response:
//   { logs: [...], nextCursor: <id|null>, hasMore: boolean }
//
router.get("/history", async (req, res) => {
  try {
    const {
      logType = "all",
      cursor,
      limit: rawLimit,
      userId,
      email,
      method,
      url,
      requestId,
      statusCode,
      statusType,
      search,
      startDate,
      endDate,
    } = req.query;

    const limit = Math.min(Math.max(parseInt(rawLimit) || 50, 1), 200);
    const fetchLimit = limit + 1; // fetch one extra to detect hasMore

    const filters = {
      userId,
      email,
      method,
      url,
      requestId,
      statusCode,
      statusType,
      search,
      startDate,
      endDate,
    };

    let results = [];

    if (logType === "all" || logType === "request") {
      const rows = await queryTable(
        "request_logs",
        "request",
        filters,
        cursor,
        fetchLimit,
      );
      results.push(...rows);
    }

    if (logType === "all" || logType === "response") {
      const rows = await queryTable(
        "response_logs",
        "response",
        filters,
        cursor,
        fetchLimit,
      );
      results.push(...rows);
    }

    // Sort descending by timestamp then id
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

    res.json({ logs: page, nextCursor, hasMore });
  } catch (err) {
    console.error("HISTORY ERROR:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

//
// 🔹 GET /logs  (legacy — kept for backward compatibility)
//
router.get("/", async (req, res) => {
  try {
    const { userId } = req.query;

    let query = "SELECT * FROM logs";
    let values = [];

    if (userId) {
      query += " WHERE user_id = $1";
      values.push(userId);
    }

    query += " ORDER BY created_at DESC LIMIT 100";

    const result = await pool.query(query, values);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// Query builder helper
// ═══════════════════════════════════════════════════════════════════════

/**
 * Build and execute a filtered, cursor-paginated query for one log table.
 *
 * @param {"request_logs"|"response_logs"} table
 * @param {"request"|"response"} logType
 * @param {object} filters
 * @param {string|undefined} cursor
 * @param {number} limit
 * @returns {Promise<object[]>}
 */
async function queryTable(table, logType, filters, cursor, limit) {
  const conditions = [];
  const values = [];
  let idx = 1;

  // Cursor
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

  // ── Request-specific ──
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

  // ── Response-specific ──
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

module.exports = router;
