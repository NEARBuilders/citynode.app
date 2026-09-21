import { ORPCError } from "@orpc/server";
export function toError(e: unknown): Error {
  if (typeof e === "object" && e !== null && "message" in e) {
    return new Error(String(e.message));
  }
  return new Error(String(e));
}

export function tryJsonParse<T>(value: string | null | undefined): T | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

export function createHeaders(reqHeaders?: Record<string, string>): Headers {
  return new Headers(Object.entries(reqHeaders ?? {}) as [string, string][]);
}

export const localDevTrustedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://[::1]:3000",
];

export function getActiveOrganizationId(session: unknown): string | null {
  if (session && typeof session === "object" && "activeOrganizationId" in session) {
    return (session as { activeOrganizationId: string | null }).activeOrganizationId;
  }
  return null;
}

export function getActiveTeamId(session: unknown): string | null {
  if (session && typeof session === "object" && "activeTeamId" in session) {
    return (session as { activeTeamId: string | null }).activeTeamId ?? null;
  }
  return null;
}

export function toORPCError(error: unknown) {
  if (error instanceof ORPCError) return error;
  if (error && typeof error === "object") {
    const apiError = error as {
      status?: number | string;
      statusCode?: number;
      message?: string;
      code?: string;
    };
    const status =
      typeof apiError.statusCode === "number"
        ? apiError.statusCode
        : typeof apiError.status === "number"
          ? apiError.status
          : undefined;
    if (status) {
      const statusMap: Record<number, string> = {
        400: "BAD_REQUEST",
        401: "UNAUTHORIZED",
        403: "FORBIDDEN",
        404: "NOT_FOUND",
        500: "INTERNAL_SERVER_ERROR",
        503: "SERVICE_UNAVAILABLE",
      };
      return new ORPCError(statusMap[status] || "INTERNAL_SERVER_ERROR", {
        message: apiError.message || "Auth API error",
      });
    }
  }
  return new ORPCError("INTERNAL_SERVER_ERROR", {
    message: error instanceof Error ? error.message : "Auth API error",
  });
}

export async function safeAuthApi<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw toORPCError(error);
  }
}

export function parseTeamAreas(metadata: unknown): string[] {
  const parsed =
    typeof metadata === "string" ? tryJsonParse<{ areas?: unknown }>(metadata) : metadata;
  if (!parsed || typeof parsed !== "object") return [];
  const areas = (parsed as { areas?: unknown }).areas;
  return Array.isArray(areas)
    ? areas.filter((area): area is string => typeof area === "string")
    : [];
}

export function serializeTeamAreas(areas: string[]): string {
  return JSON.stringify({ areas: [...new Set(areas)] });
}
