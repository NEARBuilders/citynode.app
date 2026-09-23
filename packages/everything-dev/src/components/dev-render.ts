import chalk from "chalk";
import { linkify } from "../utils/linkify";
import { colors, divider, frames, gradients, icons } from "../utils/theme";

const PLUGIN_PREFIX = "plugin:";
const VIEW_WIDTH = 52;
const LOG_TAIL = 12;

export type DevProcessStatus = "pending" | "starting" | "ready" | "error";

export interface DevProcessState {
  name: string;
  status: DevProcessStatus;
  port: number;
  message?: string;
  source?: string;
}

export interface DevLogLine {
  source: string;
  line: string;
  isError?: boolean;
}

export interface DevSessionState {
  description: string;
  proxyTarget?: string;
  processes: DevProcessState[];
  logs: DevLogLine[];
}

export interface DevRendererHandle {
  updateProcess: (name: string, status: DevProcessStatus, message?: string) => void;
  addLog: (source: string, line: string, isError?: boolean) => void;
  unmount: () => void;
}

export interface DevRendererOutput {
  write: (text: string) => void;
}

interface DevRendererInput {
  setRawMode?: (mode: boolean) => void;
  on: (event: string, listener: (...args: unknown[]) => void) => unknown;
  removeListener: (event: string, listener: (...args: unknown[]) => void) => unknown;
}

export const getDisplayName = (name: string): string =>
  name.startsWith(PLUGIN_PREFIX)
    ? name.slice(PLUGIN_PREFIX.length).toUpperCase()
    : name.toUpperCase();

export const isPlugin = (name: string): boolean => name.startsWith(PLUGIN_PREFIX);

const getServiceColor = (name: string): ((text: string) => string) => {
  if (name.startsWith(PLUGIN_PREFIX)) return colors.orange;
  return name === "host" ? colors.cyan : name === "ui" ? colors.magenta : colors.blue;
};

const getStatusText = (proc: DevProcessState): string => {
  switch (proc.status) {
    case "pending":
      return "waiting";
    case "starting":
      return "starting";
    case "ready":
      return proc.source === "remote" && proc.name !== "host" ? "loaded" : "running";
    case "error":
      return "failed";
  }
};

const getStatusIcon = (status: DevProcessStatus): string => {
  switch (status) {
    case "pending":
      return colors.gray(icons.pending);
    case "starting":
      return colors.cyan(icons.scan);
    case "ready":
      return colors.green(icons.ok);
    case "error":
      return colors.error(icons.err);
  }
};

export const sectionProcesses = (
  processes: DevProcessState[],
): Array<{
  key: string;
  title: string;
  processes: DevProcessState[];
}> => {
  const plugins = processes.filter((p) => isPlugin(p.name));
  const services = processes.filter((p) => !isPlugin(p.name));
  const sections: Array<{ key: string; title: string; processes: DevProcessState[] }> = [];
  if (plugins.length > 0) sections.push({ key: "plugins", title: "PLUGINS", processes: plugins });
  if (services.length > 0)
    sections.push({ key: "services", title: "SERVICES", processes: services });
  return sections;
};

const getColumnWidths = (processes: DevProcessState[]): { name: number; source: number } => {
  const name = Math.max(6, ...processes.map((p) => getDisplayName(p.name).length));
  const source = Math.max(10, ...processes.map((p) => (p.source ? ` (${p.source})`.length : 0)));
  return { name, source };
};

export const renderProcessRow = (
  proc: DevProcessState,
  nameWidth: number,
  sourceWidth: number,
): string => {
  const color = getServiceColor(proc.name);
  const isRemote = proc.source === "remote";
  const isHost = proc.name === "host";
  const showPort = proc.port > 0 && (isHost || !isRemote);
  const portStr = showPort ? `:${proc.port}` : "";
  const sourceLabel = proc.source ? ` (${proc.source})` : "";
  const statusColor = proc.status === "ready" ? colors.green : colors.gray;
  return `  ${getStatusIcon(proc.status)} ${chalk.bold(color(getDisplayName(proc.name).padEnd(nameWidth)))}${colors.gray(sourceLabel.padEnd(sourceWidth))} ${statusColor(getStatusText(proc))}${showPort ? colors.cyan(` ${portStr}`) : ""}`;
};

export const renderLogLine = (entry: DevLogLine): string => {
  const color = getServiceColor(entry.source);
  return `${color(`[${entry.source}]`)} ${entry.isError ? colors.error(linkify(entry.line)) : linkify(entry.line)}`;
};

const truncateUrl = (url: string, maxLen: number): string => {
  if (url.length <= maxLen) return url;
  try {
    const parsed = new URL(url);
    const host = parsed.host;
    if (host.length > maxLen - 10) return `${host.slice(0, maxLen - 13)}…`;
    return `${host}…`;
  } catch {
    return `${url.slice(0, maxLen - 3)}…`;
  }
};

const renderReadyBlock = (hostPort: number): string[] => [
  `  ${colors.green(icons.app)} APP READY`,
  `  ${chalk.bold(colors.green(icons.arrow))} http://localhost:${hostPort}`,
];

const renderProxyLine = (proxyTarget: string): string =>
  `  ${colors.orange(icons.arrow)} API PROXY → ${truncateUrl(proxyTarget, 38)}`;

const renderBanner = (description: string): string[] => [
  colors.cyan(frames.top(VIEW_WIDTH)),
  `  ${icons.run} ${gradients.cyber(description.toUpperCase())}`,
  colors.cyan(frames.bottom(VIEW_WIDTH)),
];

const getHostPort = (processes: DevProcessState[]): number =>
  processes.find((p) => p.name === "host")?.port || 3000;

export function renderDevState(state: DevSessionState): string {
  const lines: string[] = renderBanner(state.description);

  const allReady = state.processes.length > 0 && state.processes.every((p) => p.status === "ready");
  const hostPort = getHostPort(state.processes);

  if (allReady) {
    lines.push("");
    lines.push(...renderReadyBlock(hostPort));
  }

  if (state.proxyTarget) {
    lines.push("");
    lines.push(renderProxyLine(state.proxyTarget));
  }

  lines.push("");
  lines.push(colors.dim(divider(VIEW_WIDTH)));

  const widths = getColumnWidths(state.processes);
  for (const section of sectionProcesses(state.processes)) {
    lines.push(`  ${chalk.bold(colors.cyan(section.title))}`);
    for (const proc of section.processes) {
      lines.push(renderProcessRow(proc, widths.name, widths.source));
    }
  }

  lines.push(colors.dim(divider(VIEW_WIDTH)));
  lines.push(
    `  ${allReady ? colors.green(icons.ok) : colors.cyan(icons.scan)} ${
      allReady
        ? `All ${state.processes.length} services running`
        : `${state.processes.filter((p) => p.status === "ready").length}/${state.processes.length} ready`
    }${colors.gray(`   ${icons.dot} q quit ${icons.dot} l logs`)}`,
  );

  if (state.logs.length > 0) {
    lines.push(colors.dim(divider(VIEW_WIDTH)));
    for (const entry of state.logs.slice(-LOG_TAIL)) {
      lines.push(renderLogLine(entry));
    }
  }

  return `${lines.join("\n")}\n`;
}

export function createDevRenderer(
  initialProcesses: DevProcessState[],
  description: string,
  env: Record<string, string>,
  onExit?: () => Promise<void> | void,
  onExportLogs?: () => Promise<void> | void,
  options?: { output?: DevRendererOutput; stdin?: DevRendererInput; interactive?: boolean },
): DevRendererHandle {
  const output = options?.output ?? process.stdout;
  const isInteractive =
    options?.interactive ?? (process.stdin.isTTY === true && process.stdout.isTTY === true);

  const state: DevSessionState = {
    description,
    proxyTarget: env.API_PROXY,
    processes: initialProcesses.map((p) => ({ ...p })),
    logs: [],
  };

  let lastLogKey: string | null = null;
  const listeners: Array<() => void> = [];

  const setState = (mutate: () => void) => {
    mutate();
    for (const listener of listeners) listener();
  };

  const handle: DevRendererHandle = {
    updateProcess: (name, status, message) =>
      setState(() => {
        state.processes = state.processes.map((p) =>
          p.name === name ? { ...p, status, message } : p,
        );
      }),
    addLog: (source, line, isError = false) =>
      setState(() => {
        const nextKey = `${source}:${isError ? "1" : "0"}:${line}`;
        if (nextKey === lastLogKey) return;
        lastLogKey = nextKey;
        state.logs = [...state.logs, { source, line, isError }];
        if (state.logs.length > 100) state.logs = state.logs.slice(-100);
      }),
    unmount: () => {},
  };

  if (!isInteractive) {
    let readyPrinted = false;
    let printedLogCount = 0;
    const printedStatuses = new Map<string, DevProcessStatus>();

    const printHeader = () => {
      const widths = getColumnWidths(state.processes);
      const lines = ["", ...renderBanner(description)];
      if (state.proxyTarget) {
        lines.push(renderProxyLine(state.proxyTarget));
      }
      lines.push("");
      for (const section of sectionProcesses(state.processes)) {
        lines.push(`  ${chalk.bold(colors.cyan(section.title))}`);
        for (const proc of section.processes) {
          lines.push(renderProcessRow(proc, widths.name, widths.source));
          printedStatuses.set(proc.name, proc.status);
        }
      }
      lines.push("");
      output.write(`${lines.join("\n")}\n`);
    };

    const printChanges = () => {
      const widths = getColumnWidths(state.processes);
      for (const proc of state.processes) {
        if (printedStatuses.get(proc.name) !== proc.status) {
          printedStatuses.set(proc.name, proc.status);
          output.write(`${renderProcessRow(proc, widths.name, widths.source)}\n`);
        }
      }
      const ready =
        state.processes.length > 0 && state.processes.every((p) => p.status === "ready");
      if (ready && !readyPrinted) {
        readyPrinted = true;
        output.write(`\n${renderReadyBlock(getHostPort(state.processes)).join("\n")}\n\n`);
      }
      for (const log of state.logs.slice(printedLogCount)) {
        output.write(`${renderLogLine(log)}\n`);
      }
      printedLogCount = state.logs.length;
    };

    printHeader();
    listeners.push(printChanges);

    return handle;
  }

  output.write("\x1b[?1049h\x1b[?25l");
  output.write(`\x1b[H\x1b[2J${renderDevState(state)}`);

  listeners.push(() => {
    output.write(`\x1b[H\x1b[2J${renderDevState(state)}`);
  });

  const stdin = options?.stdin ?? process.stdin;
  const rawCapable = stdin as DevRendererInput & { setRawMode?: (mode: boolean) => void };

  let exiting = false;
  const onKey = (...args: unknown[]) => {
    if (exiting) return;
    const data = args[0] as Buffer;
    const key = data.toString();
    if (key === "q" || key === "\x03") {
      exiting = true;
      void Promise.resolve(onExit?.());
      return;
    }
    if (key === "l") {
      exiting = true;
      void Promise.resolve(onExportLogs?.());
    }
  };

  rawCapable.setRawMode?.(true);
  rawCapable.on("data", onKey);

  handle.unmount = () => {
    rawCapable.removeListener("data", onKey);
    rawCapable.setRawMode?.(false);
    output.write("\x1b[?25h\x1b[?1049l");
  };

  return handle;
}
