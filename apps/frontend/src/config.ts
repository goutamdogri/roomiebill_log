const BACKEND_HOST = import.meta.env.VITE_BACKEND_HOST ?? "";
const BACKEND_PROTOCOL = import.meta.env.VITE_BACKEND_PROTOCOL ?? "";

// In development with Vite proxy, use relative URLs (empty base).
// In production or when VITE_BACKEND_HOST is set, use full URLs.
const apiBase = BACKEND_HOST
  ? `${BACKEND_PROTOCOL || "http"}://${BACKEND_HOST}`
  : "";

const wsBase = BACKEND_HOST
  ? `${BACKEND_PROTOCOL === "https" ? "wss" : "ws"}://${BACKEND_HOST}`
  : `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}`;

export const config = {
  apiBaseUrl: apiBase,
  wsUrl: `${wsBase}/ws/logs`,
} as const;
