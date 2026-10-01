export type LogLevel = "debug" | "info" | "warn" | "error";

const levelRank: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
let minimumLevel: LogLevel = "debug";

export function configureLogger(level: LogLevel): void {
  minimumLevel = level;
}

export type LogFields = Record<string, unknown>;

/** One JSON line per event so a request, its errors and its provider calls share a request id. */
export function log(level: LogLevel, event: string, fields: LogFields = {}): void {
  if (levelRank[level] < levelRank[minimumLevel]) return;
  const line = { level, time: new Date().toISOString(), event, ...fields };
  const message = JSON.stringify(line);
  if (level === "error") {
    console.error(message);
    return;
  }
  if (level === "warn") {
    console.warn(message);
    return;
  }
  console.log(message);
}

export const logger = {
  debug: (event: string, fields?: LogFields) => log("debug", event, fields),
  info: (event: string, fields?: LogFields) => log("info", event, fields),
  warn: (event: string, fields?: LogFields) => log("warn", event, fields),
  error: (event: string, fields?: LogFields) => log("error", event, fields),
};

/** Identifier-shaped values only: class names and typed codes, never free text. */
const stableIdentifier = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

function stable(value: unknown): string | undefined {
  return typeof value === "string" && stableIdentifier.test(value) ? value : undefined;
}

/**
 * Diagnosable without leaking: the error class name and any typed code (`ApiError.code`,
 * `OutlayerError.code`, a Node system code) or RPC error type. Messages and provider bodies can
 * carry secrets and are never logged.
 */
export function errorFields(error: unknown): LogFields {
  if (!(error instanceof Error)) return { error_kind: "thrown_value" };
  const { code, type } = error as { code?: unknown; type?: unknown };
  const name = stable(error.name);
  const errorCode = stable(code);
  const errorType = stable(type);
  return {
    error_kind: "exception",
    ...(name ? { error_name: name } : {}),
    ...(errorCode ? { error_code: errorCode } : {}),
    ...(errorType ? { error_type: errorType } : {}),
  };
}

/** Stable per-request id so demo logs, API logs and provider calls can be correlated. */
export function requestId(): string {
  return crypto.randomUUID();
}
