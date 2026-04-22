import { Effect } from "every-plugin/effect";
import type { z } from "every-plugin/zod";
import type {
  PromptResultSchema,
  ServerEventSchema,
  ServerStatusSchema,
  SessionSchema,
  StartServerResultSchema,
} from "./contract";

type ServerStatus = z.infer<typeof ServerStatusSchema>;
type StartServerResult = z.infer<typeof StartServerResultSchema>;
type Session = z.infer<typeof SessionSchema>;
type PromptResult = z.infer<typeof PromptResultSchema>;
type ServerEvent = z.infer<typeof ServerEventSchema>;

interface OpencodeHealthResponse {
  version?: string;
  uptime?: number;
}

interface OpencodeSessionResponse {
  id?: string;
  sessionId?: string;
  title?: string;
  createdAt?: string;
}

interface OpencodeMessageResponse {
  id?: string;
  messageId?: string;
}

export class OpencodeService {
  private readonly baseUrl: string;
  private readonly port: number;
  private readonly host: string;
  private readonly apiKey: string | undefined;

  constructor(host: string, port: number, apiKey?: string) {
    this.host = host;
    this.port = port;
    this.baseUrl = `http://${host}:${port}`;
    this.apiKey = apiKey;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.apiKey) {
      h["Authorization"] = `Bearer ${this.apiKey}`;
    }
    return h;
  }

  async getServerStatus(): Promise<ServerStatus> {
    try {
      const res = await Effect.runPromise(
        Effect.tryPromise({
          try: () => fetch(`${this.baseUrl}/global/health`, { signal: AbortSignal.timeout(5000) }),
          catch: () => new Error("Server unreachable"),
        }),
      );

      if (!res.ok) {
        return {
          running: false,
          port: this.port,
          host: this.host,
          url: this.baseUrl,
        };
      }

      const body = (await res.json().catch(() => ({}))) as OpencodeHealthResponse;
      return {
        running: true,
        port: this.port,
        host: this.host,
        url: this.baseUrl,
        version: body.version ?? undefined,
        uptime: body.uptime ?? undefined,
      };
    } catch {
      return {
        running: false,
        port: this.port,
        host: this.host,
        url: this.baseUrl,
      };
    }
  }

  async startServer(): Promise<StartServerResult> {
    const status = await this.getServerStatus();
    if (status.running) {
      return {
        status: "already_running",
        url: this.baseUrl,
        message: `opencode server is already running at ${this.baseUrl}`,
      };
    }

    return {
      status: "unavailable",
      url: this.baseUrl,
      message: `Cannot start opencode server remotely. Run 'opencode serve --port ${this.port} --cors http://localhost:3000' in the project directory.`,
    };
  }

  async createSession(title?: string): Promise<Session> {
    const res = await Effect.runPromise(
      Effect.tryPromise({
        try: () =>
          fetch(`${this.baseUrl}/session`, {
            method: "POST",
            headers: this.headers(),
            body: JSON.stringify({ title: title || "opencode dashboard session" }),
            signal: AbortSignal.timeout(10000),
          }),
        catch: () => new Error("Failed to create session"),
      }),
    );

    if (!res.ok) {
      throw new Error(`Failed to create session: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as OpencodeSessionResponse;
    return {
      id: data.id ?? data.sessionId ?? "",
      title: data.title ?? title,
      createdAt: data.createdAt ?? new Date().toISOString(),
    };
  }

  async sendPrompt(sessionId: string, message: string): Promise<PromptResult> {
    try {
      const res = await Effect.runPromise(
        Effect.tryPromise({
          try: () =>
            fetch(`${this.baseUrl}/session/${sessionId}/message`, {
              method: "POST",
              headers: this.headers(),
              body: JSON.stringify({ content: message }),
              signal: AbortSignal.timeout(30000),
            }),
          catch: () => new Error("Failed to send prompt"),
        }),
      );

      if (!res.ok) {
        return {
          sessionId,
          status: "error",
          messageId: undefined,
        };
      }

      const data = (await res.json()) as OpencodeMessageResponse;
      return {
        sessionId,
        messageId: data.id ?? data.messageId,
        status: "sent",
      };
    } catch {
      return {
        sessionId,
        status: "error",
        messageId: undefined,
      };
    }
  }

  async *streamEvents(
    sessionId?: string,
    lastEventId?: string,
    signal?: AbortSignal,
  ): AsyncGenerator<ServerEvent> {
    const params = new URLSearchParams();
    if (sessionId) params.set("sessionId", sessionId);
    if (lastEventId) params.set("lastEventId", lastEventId);
    const qs = params.toString();
    const url = `${this.baseUrl}/event${qs ? `?${qs}` : ""}`;

    try {
      const res = await fetch(url, {
        headers: this.headers(),
        signal: signal ?? AbortSignal.timeout(300000),
      });

      if (!res.ok || !res.body) return;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const parsed = JSON.parse(line.slice(6)) as ServerEvent;
              if (parsed.type) {
                yield parsed;
              }
            } catch {
              // skip malformed lines
            }
          }
        }
      }
    } catch {
      // connection closed or errored
    }

    yield {
      type: "status",
      data: {
        running: false,
        port: this.port,
        host: this.host,
        url: this.baseUrl,
      },
    };
  }
}
