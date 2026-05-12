-- ============================================================================
-- Live Logging: PostgreSQL NOTIFY Triggers
--
-- These triggers fire on every INSERT into request_logs / response_logs and
-- send a lightweight NOTIFY with just the new row's id.  The Node.js backend
-- listens on these channels, fetches the full row, and broadcasts via WS.
-- ============================================================================

-- ── Request logs trigger ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION notify_new_request_log()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify(
    'new_request_log',
    json_build_object('id', NEW.id, 'table', 'request_logs')::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_new_request_log ON request_logs;

CREATE TRIGGER trg_notify_new_request_log
  AFTER INSERT ON request_logs
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_request_log();

-- ── Response logs trigger ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION notify_new_response_log()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify(
    'new_response_log',
    json_build_object('id', NEW.id, 'table', 'response_logs')::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_new_response_log ON response_logs;

CREATE TRIGGER trg_notify_new_response_log
  AFTER INSERT ON response_logs
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_response_log();
