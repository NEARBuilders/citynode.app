import { createServer } from "node:http";
import { platform } from "node:os";
import { execa } from "execa";

export const CALLBACK_PATH = "/callback";

export interface LoginHandoff {
  apiKey: string;
  apiKeyId: string;
  accountId: string | null;
  added?: boolean;
  error?: string;
}

export interface LoginServerHandle {
  url: (params?: {
    account?: string;
    device?: string;
    expiresIn?: number;
    mode?: string;
    extra?: Record<string, string>;
  }) => string;
  state: string;
  port: number;
  waitForHandoff: (timeoutMs?: number) => Promise<LoginHandoff>;
  close: () => void;
}

export function createLoginState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function startLoginServer(opts: { siteUrl: string }): Promise<LoginServerHandle> {
  const state = createLoginState();
  let captured: { resolve: (value: LoginHandoff) => void } | null = null;

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "", "http://127.0.0.1");
    if (url.pathname !== CALLBACK_PATH) {
      res.statusCode = 404;
      res.end("not found");
      return;
    }

    const stateParam = url.searchParams.get("state") ?? "";
    const errorParam = url.searchParams.get("error");

    if (stateParam !== state) {
      res.statusCode = 400;
      res.end("state mismatch — unknown login session");
      return;
    }

    captured?.resolve({
      apiKey: url.searchParams.get("key") ?? "",
      apiKeyId: url.searchParams.get("keyId") ?? "",
      accountId: url.searchParams.get("account") || null,
      added: url.searchParams.get("added") === "1" || undefined,
      error: errorParam ?? undefined,
    });

    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html");
    res.end(`<script>window.close();</script><p>Login captured — you can close this window.</p>`);
  });

  const port = await new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to bind loopback login server"));
        return;
      }
      resolve(address.port);
    });
  });

  return {
    state,
    port,
    url: ({ account, device, expiresIn, mode, extra } = {}) => {
      const params = new URLSearchParams({
        state,
        port: String(port),
      });
      if (account) params.set("account", account);
      if (device) params.set("device", device);
      if (expiresIn !== undefined) params.set("expiresIn", String(expiresIn));
      if (mode) params.set("mode", mode);
      for (const [key, value] of Object.entries(extra ?? {})) {
        params.set(key, value);
      }
      return `${opts.siteUrl}/cli?${params.toString()}`;
    },
    waitForHandoff: (timeoutMs = 10 * 60_000) =>
      new Promise<LoginHandoff>((resolve, reject) => {
        captured = { resolve };
        setTimeout(() => {
          if (!captured) return;
          captured = null;
          reject(new Error("Login timed out — no browser handoff received"));
        }, timeoutMs);
      }),
    close: () => {
      server.close();
    },
  };
}

export async function openInBrowser(url: string): Promise<void> {
  const os = platform();
  try {
    if (os === "darwin") {
      await execa("open", [url], { stdio: "ignore" });
    } else if (os === "win32") {
      await execa("cmd", ["/c", "start", "", url], {
        stdio: "ignore",
        windowsVerbatimArguments: true,
      });
    } else {
      await execa("xdg-open", [url], { stdio: "ignore" });
    }
  } catch {
    throw new Error(`Failed to open browser. Open this URL manually:\n  ${url}`);
  }
}
