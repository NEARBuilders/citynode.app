import { getOutlayer } from "../lib/outlayer.js";
import { sponsorBalanceMetrics } from "../lib/sponsor-balance.js";
import { sponsorPoolMetrics } from "../lib/sponsor-pool.js";

type RouteMetrics = { count: number; errors: number; totalMs: number; maxMs: number };

const routes = new Map<string, RouteMetrics>();
const counters = new Map<string, number>();
const MAX_ROUTE_METRICS = 128;
const MAX_COUNTER_METRICS = 128;
const OVERFLOW_ROUTE = "OTHER <overflow>";
const OVERFLOW_COUNTER = "other";
const UNMATCHED_ROUTE = "<unmatched>";
const MAX_ROUTE_TEMPLATE_LENGTH = 192;
const HTTP_METHODS = new Set([
  "CONNECT",
  "DELETE",
  "GET",
  "HEAD",
  "OPTIONS",
  "PATCH",
  "POST",
  "PUT",
  "TRACE",
]);

/** Build a metric/log label from Hono's registered route template, never the request URL. */
export function httpRouteLabel(method: string, routeTemplate?: string): string {
  const normalizedMethod = HTTP_METHODS.has(method) ? method : "OTHER";
  const registeredPath = routeTemplate === "/*" ? undefined : routeTemplate;
  const normalizedPath =
    registeredPath?.startsWith("/") && registeredPath.length <= MAX_ROUTE_TEMPLATE_LENGTH
      ? registeredPath
      : UNMATCHED_ROUTE;
  return `${normalizedMethod} ${normalizedPath}`;
}

/**
 * In-process counters exposed as JSON from `/metrics`.
 *
 * This is deliberately dependency-free: one replica's numbers, scraped by whatever the platform
 * already runs. A process restart resets them, which is acceptable for latency/error visibility
 * and avoids pretending these are durable business metrics.
 */
export function recordHttpRequest(
  method: string,
  routeTemplate: string | undefined,
  status: number,
  durationMs: number,
) {
  const route = httpRouteLabel(method, routeTemplate);
  const routeKey =
    routes.has(route) || routes.size < MAX_ROUTE_METRICS - 1 ? route : OVERFLOW_ROUTE;
  const entry = routes.get(routeKey) ?? { count: 0, errors: 0, totalMs: 0, maxMs: 0 };
  entry.count += 1;
  entry.totalMs += durationMs;
  entry.maxMs = Math.max(entry.maxMs, durationMs);
  if (status >= 500 || status === 429) entry.errors += 1;
  routes.set(routeKey, entry);
}

export function recordCounter(name: string, amount = 1) {
  const safeName = /^[a-zA-Z0-9_.-]{1,96}$/.test(name) ? name : OVERFLOW_COUNTER;
  const counterKey =
    counters.has(safeName) || counters.size < MAX_COUNTER_METRICS - 1 ? safeName : OVERFLOW_COUNTER;
  const increment = Number.isFinite(amount) ? amount : 0;
  counters.set(counterKey, (counters.get(counterKey) ?? 0) + increment);
}

export function metricsSnapshot() {
  const http = [...routes.entries()]
    .map(([route, entry]) => ({
      route,
      count: entry.count,
      errors: entry.errors,
      avg_ms: Math.round(entry.totalMs / entry.count),
      max_ms: entry.maxMs,
    }))
    .sort((a, b) => b.count - a.count);
  return {
    sponsor_pool: sponsorPoolMetrics(),
    sponsor_balance: sponsorBalanceMetrics(),
    observed_at: new Date().toISOString(),
    process: { uptime_ms: Math.round(process.uptime() * 1000) },
    provider: { contract_id: getOutlayer().contractId },
    counters: Object.fromEntries(counters),
    http: http.slice(0, 50),
  };
}
