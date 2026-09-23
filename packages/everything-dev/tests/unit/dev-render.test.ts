import { EventEmitter } from "node:events";
import chalk from "chalk";
import { describe, expect, it, vi } from "vitest";
import {
  createDevRenderer,
  type DevProcessState,
  renderDevState,
} from "../../src/components/dev-render";

import { stripAnsi } from "../../src/dev-log-pipeline";

const proc = (
  name: string,
  status: DevProcessState["status"],
  port = 0,
  source?: string,
): DevProcessState => ({ name, status, port, source });

const baseState = {
  description: "dev session",
  processes: [
    proc("plugin:apps", "ready", 3010, "local"),
    proc("host", "ready", 3000),
    proc("api", "starting", 3001),
    proc("ui", "pending", 3003),
  ],
  logs: [],
};

describe("renderDevState", () => {
  it("renders the boxed banner with the uppercased description", () => {
    const out = stripAnsi(renderDevState(baseState));
    expect(out).toContain("┌");
    expect(out).toContain("└");
    expect(out).toContain("DEV SESSION");
  });

  it("groups plugins under PLUGINS and core services under SERVICES", () => {
    const out = stripAnsi(renderDevState(baseState));
    const pluginsIdx = out.indexOf("PLUGINS");
    const servicesIdx = out.indexOf("SERVICES");
    expect(pluginsIdx).toBeGreaterThanOrEqual(0);
    expect(servicesIdx).toBeGreaterThan(pluginsIdx);
    expect(out).toContain("APPS");
    expect(out).toContain("HOST");
    const appsPos = out.indexOf("APPS");
    const hostPos = out.indexOf("HOST");
    expect(appsPos).toBeGreaterThan(pluginsIdx);
    expect(hostPos).toBeGreaterThan(servicesIdx);
  });

  it("shows APP READY with the host port only when every process is ready", () => {
    const notReady = stripAnsi(renderDevState(baseState));
    expect(notReady).not.toContain("APP READY");
    expect(notReady).toContain("2/4 ready");

    const allReady = stripAnsi(
      renderDevState({
        ...baseState,
        processes: baseState.processes.map((p) => ({ ...p, status: "ready" as const })),
      }),
    );
    expect(allReady).toContain("APP READY");
    expect(allReady).toContain("http://localhost:3000");
    expect(allReady).toContain("All 4 services running");
  });

  it("renders the API PROXY line when configured", () => {
    const out = stripAnsi(
      renderDevState({
        ...baseState,
        proxyTarget: "https://gw.example.com/api",
      }),
    );
    expect(out).toContain("API PROXY");
    expect(out).toContain("gw.example.com");
  });

  it("truncates long proxy targets", () => {
    const out = stripAnsi(
      renderDevState({
        ...baseState,
        proxyTarget: "https://an-extremely-long-proxy-hostname.example.com/api",
      }),
    );
    expect(out).toContain("…");
  });

  it("renders only the last 12 log lines", () => {
    const logs = Array.from({ length: 20 }, (_, i) => ({
      source: "api",
      line: `log line ${i + 1}`,
      isError: false,
    }));
    const out = stripAnsi(renderDevState({ ...baseState, logs }));
    expect(out).not.toContain("log line 8");
    expect(out).toContain("log line 9");
    expect(out).toContain("log line 20");
  });

  it("always renders the key hints", () => {
    const out = stripAnsi(renderDevState(baseState));
    expect(out).toContain("q quit");
    expect(out).toContain("l logs");
  });

  it("marks error log lines", () => {
    const prevLevel = chalk.level;
    chalk.level = 3;
    try {
      const out = renderDevState({
        ...baseState,
        logs: [{ source: "api", line: "boom", isError: true }],
      });
      expect(out).toContain("boom");
      expect(out).toContain("\x1b[38;2;255;51;102m");
    } finally {
      chalk.level = prevLevel;
    }
  });

  it("shows failed status for error processes", () => {
    const out = stripAnsi(
      renderDevState({
        ...baseState,
        processes: [proc("host", "error", 3000)],
      }),
    );
    expect(out).toContain("failed");
  });
});

describe("createDevRenderer (non-TTY incremental)", () => {
  const makeRenderer = () => {
    const chunks: string[] = [];
    const output = { write: (s: string) => chunks.push(s) };
    const renderer = createDevRenderer(
      baseState.processes,
      "dev session",
      {},
      undefined,
      undefined,
      {
        output,
        interactive: false,
      },
    );
    return { renderer, chunks, text: () => stripAnsi(chunks.join("")) };
  };

  it("prints the header once, then process rows incrementally", () => {
    const { renderer, text } = makeRenderer();
    expect(text()).toContain("DEV SESSION");
    expect(text()).toContain("HOST");
    const before = text();
    renderer.updateProcess("api", "ready");
    expect(text()).toContain("running");
    expect(text().length).toBeGreaterThan(before.length);
  });

  it("prints log lines as they arrive and dedupes repeats", () => {
    const { renderer, chunks, text } = makeRenderer();
    renderer.addLog("api", "ready in 412 ms", false);
    const count = chunks.length;
    renderer.addLog("api", "ready in 412 ms", false);
    expect(chunks.length).toBe(count);
    expect(text()).toContain("ready in 412 ms");
  });

  it("prints the all-ready block exactly once", () => {
    const { renderer, text } = makeRenderer();
    for (const p of baseState.processes) {
      renderer.updateProcess(p.name, "ready");
    }
    expect(text().match(/APP READY/g)?.length).toBe(1);
  });

  it("unmount is a no-op without output changes", () => {
    const { renderer, text } = makeRenderer();
    renderer.unmount();
    expect(text()).toContain("DEV SESSION");
  });
});

describe("createDevRenderer (TTY alt-screen)", () => {
  const makeTty = () => {
    const chunks: string[] = [];
    const output = { write: (s: string) => chunks.push(s) };
    const stdin = new EventEmitter() as EventEmitter & {
      setRawMode: (mode: boolean) => void;
      isTTY: boolean;
      unref?: () => void;
    };
    stdin.setRawMode = vi.fn();
    return { stdin, chunks, output };
  };

  it("enters alt-screen, hides cursor, and redraws on state change", () => {
    const { stdin, chunks, output } = makeTty();
    const renderer = createDevRenderer(
      baseState.processes,
      "dev session",
      {},
      undefined,
      undefined,
      {
        output,
        interactive: true,
        stdin,
      },
    );
    expect(chunks.join("")).toContain("\x1b[?1049h");
    expect(chunks.join("")).toContain("\x1b[?25l");
    expect(chunks.join("")).toContain("DEV SESSION");

    renderer.updateProcess("host", "ready");
    expect(chunks.filter((c) => c.includes("\x1b[H\x1b[2J")).length).toBeGreaterThanOrEqual(1);
  });

  it("q triggers exit; unmount restores the terminal and raw mode", () => {
    const { stdin, chunks, output } = makeTty();
    const onExit = vi.fn();
    const renderer = createDevRenderer(baseState.processes, "dev session", {}, onExit, undefined, {
      output,
      interactive: true,
      stdin,
    });

    stdin.emit("data", Buffer.from("q"));
    expect(onExit).toHaveBeenCalledTimes(1);

    renderer.unmount();
    expect(stdin.setRawMode).toHaveBeenLastCalledWith(false);
    expect(chunks.join("")).toContain("\x1b[?25h");
    expect(chunks.join("")).toContain("\x1b[?1049l");
    expect(stdin.listenerCount("data")).toBe(0);
  });

  it("ctrl+c exits like q", () => {
    const { stdin, output } = makeTty();
    const onExit = vi.fn();
    createDevRenderer(baseState.processes, "dev session", {}, onExit, undefined, {
      output,
      interactive: true,
      stdin,
    });
    stdin.emit("data", Buffer.from("\x03"));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("l triggers export", () => {
    const { stdin, output } = makeTty();
    const onExportLogs = vi.fn();
    createDevRenderer(baseState.processes, "dev session", {}, undefined, onExportLogs, {
      output,
      interactive: true,
      stdin,
    });
    stdin.emit("data", Buffer.from("l"));
    expect(onExportLogs).toHaveBeenCalledTimes(1);
  });
});
