import { FORBIDDEN, NOT_FOUND, UNAUTHORIZED } from "every-plugin/errors";
import { eventIterator, oc } from "every-plugin/orpc";
import { z } from "every-plugin/zod";

export const ServerStatusSchema = z.object({
  running: z.boolean().describe("Whether the opencode server is reachable"),
  port: z.number().describe("Configured port number"),
  host: z.string().describe("Configured host"),
  url: z.string().describe("Full URL of the opencode server"),
  version: z.string().optional().describe("Server version if available"),
  uptime: z.number().optional().describe("Server uptime in seconds if available"),
});

export const StartServerResultSchema = z.object({
  status: z.enum(["started", "already_running", "unavailable"]).describe("Result of start attempt"),
  url: z.string().describe("URL of the opencode server"),
  message: z.string().describe("Human-readable status message"),
});

export const SessionSchema = z.object({
  id: z.string().describe("Session identifier"),
  title: z.string().optional().describe("Session title"),
  createdAt: z.string().datetime().describe("When the session was created"),
});

export const PromptResultSchema = z.object({
  sessionId: z.string().describe("Session the prompt was sent to"),
  messageId: z.string().optional().describe("Message identifier if available"),
  status: z.enum(["sent", "error"]).describe("Whether the prompt was sent successfully"),
});

export const ServerEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("status"),
    data: ServerStatusSchema,
  }),
  z.object({
    type: z.literal("message"),
    sessionId: z.string(),
    content: z.string(),
    role: z.enum(["user", "assistant", "system"]),
  }),
  z.object({
    type: z.literal("session"),
    sessionId: z.string(),
    title: z.string().optional(),
  }),
]);

export const contract = oc.router({
  serverStatus: oc
    .route({
      method: "GET",
      path: "/opencode/server/status",
      summary: "Check opencode server status",
      description:
        "Returns whether the opencode server is reachable and its configuration. Requires admin role.",
      tags: ["Opencode", "Server"],
    })
    .output(z.object({ data: ServerStatusSchema }))
    .errors({ UNAUTHORIZED, FORBIDDEN }),

  startServer: oc
    .route({
      method: "POST",
      path: "/opencode/server/start",
      summary: "Start opencode server",
      description:
        "Attempts to start the opencode server if it is not already running. Requires admin role.",
      tags: ["Opencode", "Server"],
    })
    .output(z.object({ data: StartServerResultSchema }))
    .errors({ UNAUTHORIZED, FORBIDDEN }),

  createSession: oc
    .route({
      method: "POST",
      path: "/opencode/session",
      summary: "Create an opencode session",
      description: "Creates a new session on the opencode server. Requires admin role.",
      tags: ["Opencode", "Session"],
    })
    .input(
      z.object({
        title: z.string().optional().describe("Optional title for the session"),
      }),
    )
    .output(z.object({ data: SessionSchema }))
    .errors({ UNAUTHORIZED, FORBIDDEN, NOT_FOUND }),

  sendPrompt: oc
    .route({
      method: "POST",
      path: "/opencode/session/{sessionId}/message",
      summary: "Send a prompt to an opencode session",
      description:
        "Sends a message to the specified session on the opencode server. Requires admin role.",
      tags: ["Opencode", "Session"],
    })
    .input(
      z.object({
        sessionId: z.string().min(1).describe("Session to send the prompt to"),
        message: z.string().min(1).describe("The prompt text to send"),
      }),
    )
    .output(z.object({ data: PromptResultSchema }))
    .errors({ UNAUTHORIZED, FORBIDDEN, NOT_FOUND }),

  events: oc
    .route({
      method: "GET",
      path: "/opencode/events",
      summary: "Stream opencode server events",
      description:
        "Streams events from the opencode server including status changes, messages, and session updates. Requires admin role.",
      tags: ["Opencode", "Streaming"],
    })
    .input(
      z.object({
        sessionId: z.string().optional().describe("Filter events to a specific session"),
        lastEventId: z.string().optional().describe("Resume from this event ID"),
      }),
    )
    .output(eventIterator(ServerEventSchema))
    .errors({ UNAUTHORIZED, FORBIDDEN }),
});

export type ContractType = typeof contract;
