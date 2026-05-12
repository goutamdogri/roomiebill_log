import { useState } from "react";
import type { LogPair, RequestLog, ResponseLog } from "../types/log";
import {
  formatTimestamp,
  formatFullTimestamp,
  getMethodColor,
  getStatusBgColor,
  formatDuration,
  truncate,
} from "../utils/formatters";

interface LogPairRowProps {
  pair: LogPair;
}

export function LogPairRow({ pair }: LogPairRowProps) {
  const [expanded, setExpanded] = useState<"request" | "response" | null>(null);

  return (
    <div className="animate-slide-in card rounded-xl">
      {/* Request ID header */}
      <div className="flex items-center gap-2 border-b border-b-default px-4 py-2">
        <span className="font-mono text-[11px] text-t-muted">
          {truncate(pair.requestId, 36)}
        </span>
        <span className="text-[10px] text-t-muted" title={formatFullTimestamp(pair.timestamp)}>
          {formatTimestamp(pair.timestamp)}
        </span>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 md:grid-cols-2">
        {/* ── LEFT: Request ── */}
        <div
          className={`cursor-pointer border-b border-b-default p-4 transition-colors hover:bg-bg-card-hover md:border-r md:border-b-0 ${
            expanded === "request" ? "bg-bg-card-hover" : ""
          }`}
          onClick={() => setExpanded((p) => (p === "request" ? null : "request"))}
        >
          {pair.request ? (
            <RequestCard log={pair.request} />
          ) : (
            <EmptyCard label="No request data" />
          )}
        </div>

        {/* ── RIGHT: Response ── */}
        <div
          className={`cursor-pointer p-4 transition-colors hover:bg-bg-card-hover ${
            expanded === "response" ? "bg-bg-card-hover" : ""
          }`}
          onClick={() => setExpanded((p) => (p === "response" ? null : "response"))}
        >
          {pair.response ? (
            <ResponseCard log={pair.response} />
          ) : (
            <PendingResponse />
          )}
        </div>
      </div>

      {/* ── Expanded detail panel ── */}
      {expanded && (
        <div
          className="animate-fade-in border-t border-b-default px-4 pb-4 pt-3"
          onClick={(e) => e.stopPropagation()}
        >
          {expanded === "request" && pair.request && (
            <RequestDetails log={pair.request} />
          )}
          {expanded === "response" && pair.response && (
            <ResponseDetails log={pair.response} />
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Request Sub-components
   ═══════════════════════════════════════════════════════════════════════ */

function RequestCard({ log }: { log: RequestLog }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-t-muted">
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
        </svg>
        Request
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-bold ${getMethodColor(log.method)}`}>
          {log.method}
        </span>
        <span className="min-w-0 truncate font-mono text-sm text-t-primary">
          {truncate(log.url, 50)}
        </span>
      </div>
      {log.email && (
        <span className="truncate text-xs text-t-muted">{log.email}</span>
      )}
    </div>
  );
}

function RequestDetails({ log }: { log: RequestLog }) {
  return (
    <div className="space-y-3">
      <DetailGrid>
        <DetailItem label="Request ID" value={log.request_id} mono />
        <DetailItem label="Method" value={log.method} />
        <DetailItem label="URL" value={log.url} mono />
        <DetailItem label="User ID" value={log.user_id ?? "—"} mono />
        <DetailItem label="Email" value={log.email ?? "—"} />
        <DetailItem label="Timestamp" value={formatFullTimestamp(log.timestamp)} />
      </DetailGrid>
      {log.headers && Object.keys(log.headers).length > 0 && (
        <CollapsibleJson label="Headers" data={log.headers} />
      )}
      {log.params && Object.keys(log.params).length > 0 && (
        <CollapsibleJson label="Params" data={log.params} />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Response Sub-components
   ═══════════════════════════════════════════════════════════════════════ */

function ResponseCard({ log }: { log: ResponseLog }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-t-muted">
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 4.5l-15 15m0 0h11.25m-11.25 0V8.25" />
        </svg>
        Response
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-bold ${getStatusBgColor(log.status_code)}`}>
          {log.status_code}
        </span>
        {log.status_type && (
          <span className="text-xs font-medium text-t-secondary">{log.status_type}</span>
        )}
        {log.duration != null && (
          <span className="ml-auto text-xs text-t-muted">{formatDuration(log.duration)}</span>
        )}
      </div>
      {log.response_message && (
        <span className="truncate text-xs text-t-muted">{truncate(log.response_message, 50)}</span>
      )}
    </div>
  );
}

function ResponseDetails({ log }: { log: ResponseLog }) {
  return (
    <DetailGrid>
      <DetailItem label="Request ID" value={log.request_id} mono />
      <DetailItem label="Status Code" value={String(log.status_code)} />
      <DetailItem label="Status Type" value={log.status_type ?? "—"} />
      <DetailItem label="Duration" value={formatDuration(log.duration)} />
      <DetailItem label="Message" value={log.response_message ?? "—"} wide />
      <DetailItem label="Timestamp" value={formatFullTimestamp(log.timestamp)} />
    </DetailGrid>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Pending / Empty States
   ═══════════════════════════════════════════════════════════════════════ */

function PendingResponse() {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-t-muted">
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 4.5l-15 15m0 0h11.25m-11.25 0V8.25" />
        </svg>
        Response
      </div>
      <div className="space-y-2">
        <div className="shimmer h-4 w-24 rounded" />
        <div className="shimmer h-3 w-36 rounded" />
      </div>
      <span className="flex items-center gap-1.5 text-xs text-t-muted">
        <span className="inline-block h-1.5 w-1.5 animate-pulse-dot rounded-full bg-accent-primary" />
        Awaiting response…
      </span>
    </div>
  );
}

function EmptyCard({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-4">
      <span className="text-xs text-t-muted">{label}</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Shared UI Primitives
   ═══════════════════════════════════════════════════════════════════════ */

function DetailGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
      {children}
    </div>
  );
}

function DetailItem({ label, value, mono, wide }: { label: string; value: string; mono?: boolean; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2 lg:col-span-3" : ""}>
      <span className="text-[11px] font-medium uppercase tracking-wider text-t-muted">{label}</span>
      <p className={`mt-0.5 break-all text-sm text-t-primary ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

function CollapsibleJson({ label, data }: { label: string; data: object }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-t-muted hover:text-t-secondary"
      >
        <svg className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        {label}
      </button>
      {open && (
        <pre className="animate-fade-in mt-1.5 max-h-48 overflow-auto rounded-lg bg-bg-input p-3 font-mono text-xs text-t-secondary">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}
