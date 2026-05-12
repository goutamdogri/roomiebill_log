require("dotenv").config();
const http = require("http");
const express = require("express");
const { initLiveLogServer } = require("./ws/liveLogServer");

const app = express();

const logsRoute = require("./routes/logs");

app.use(express.json());

app.use("/logs", logsRoute);

// Health-check endpoint
app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// ── Create HTTP server (required for WebSocket attachment) ────────────
const server = http.createServer(app);

// ── Attach WebSocket live-log server ─────────────────────────────────
const wss = initLiveLogServer(server);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// ── Graceful shutdown ────────────────────────────────────────────────
function shutdown(signal) {
  console.log(`\n[${signal}] Shutting down gracefully…`);

  // Close WebSocket connections
  wss.clients.forEach((ws) => {
    ws.close(1001, "Server shutting down");
  });
  wss.close();

  // Close HTTP server
  server.close(() => {
    console.log("HTTP server closed");
    process.exit(0);
  });

  // Force exit after 5 seconds
  setTimeout(() => {
    console.error("Forced shutdown after timeout");
    process.exit(1);
  }, 5000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
