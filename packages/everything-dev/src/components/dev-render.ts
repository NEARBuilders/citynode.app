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

const isPlugin = (name: string): boolean => name.startsWith(PLUGIN_PREFIX);

const CORE_SERVICES = new Set(["host", "api", "ui"]);

const UI_PREFIX = "plugin-ui:";

export interface MergedProcess extends DevProcessState {
  ui?: DevProcessState;
}

const STATUS_RANK: Record<DevProcessStatus, number> = {
  ready: 0,
  pending: 1,
  starting: 2,
  error: 3,
};

const worstStatus = (a: DevProcessStatus, b: DevProcessStatus): DevProcessStatus =>
  STATUS_RANK[a] >= STATUS_RANK[b] ? a : b;

/**
 * One row per plugin: `plugin-ui:<id>` companions merge into their parent
 * (`plugin:<id>`, or the `auth` app slot for the auth mirror) as an inline
 * ui-port annotation. Orphan ui rows (no parent process) render as-is.
 */
export const mergePluginUiRows = (processes: DevProcessState[]): MergedProcess[] => {
  const byName = new Map(processes.map((p) => [p.name, p]));
  const consumed = new Set<string>();
  const merged: MergedProcess[] = [];

  for (const proc of processes) {
    if (proc.name.startsWith(UI_PREFIX)) continue;
    const row: MergedProcess = { ...proc };
    const pluginId = isPlugin(proc.name) ? proc.name.slice(PLUGIN_PREFIX.length) : proc.name;
    const ui = byName.get(`${UI_PREFIX}${pluginId}`);
    if (ui) {
      row.ui = ui;
      row.status = worstStatus(proc.status, ui.status);
      consumed.add(ui.name);
    }
    merged.push(row);
  }

  for (const proc of processes) {
    if (!consumed.has(proc.name) && proc.name.startsWith(UI_PREFIX)) merged.push({ ...proc });
  }
  return merged;
};

const getServiceColor = (name: string): ((text: string) => string) => {
  if (name === "host") return colors.cyan;
  if (name === "ui") return colors.magenta;
  if (CORE_SERVICES.has(name)) return colors.blue;
  return colors.orange;
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
  processes: MergedProcess[],
): Array<{
  key: string;
  title: string;
  processes: MergedProcess[];
}> => {
  const plugins = processes.filter((p) => !CORE_SERVICES.has(p.name));
  const services = processes.filter((p) => CORE_SERVICES.has(p.name));
  const sections: Array<{ key: string; title: string; processes: MergedProcess[] }> = [];
  if (plugins.length > 0) sections.push({ key: "plugins", title: "PLUGINS", processes: plugins });
  if (services.length > 0)
    sections.push({ key: "services", title: "SERVICES", processes: services });
  return sections;
};

const getColumnWidths = (processes: MergedProcess[]): { name: number; source: number } => {
  const name = Math.max(6, ...processes.map((p) => getDisplayName(p.name).length));
  const source = Math.max(10, ...processes.map((p) => (p.source ? ` (${p.source})`.length : 0)));
  return { name, source };
};

export const renderProcessRow = (
  proc: MergedProcess,
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
  const uiAnnotation = proc.ui ? colors.gray(` · ui :${proc.ui.port}`) : "";
  return `  ${getStatusIcon(proc.status)} ${chalk.bold(color(getDisplayName(proc.name).padEnd(nameWidth)))}${colors.gray(sourceLabel.padEnd(sourceWidth))} ${statusColor(getStatusText(proc))}${showPort ? colors.cyan(` ${portStr}`) : ""}${uiAnnotation}`;
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
  const rows = mergePluginUiRows(state.processes);
  const lines: string[] = renderBanner(state.description);

  const allReady = rows.length > 0 && rows.every((p) => p.status === "ready");
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

  const widths = getColumnWidths(rows);
  for (const section of sectionProcesses(rows)) {
    lines.push(`  ${chalk.bold(colors.cyan(section.title))}`);
    for (const proc of section.processes) {
      lines.push(renderProcessRow(proc, widths.name, widths.source));
    }
  }

  lines.push(colors.dim(divider(VIEW_WIDTH)));
  lines.push(
    `  ${allReady ? colors.green(icons.ok) : colors.cyan(icons.scan)} ${
      allReady
        ? `All ${rows.length} services running`
        : `${rows.filter((p) => p.status === "ready").length}/${rows.length} ready`
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
    const printedRows = new Map<string, string>();

    const rowKey = (row: MergedProcess): string => `${row.status}:${row.ui?.port ?? ""}`;

    const printHeader = () => {
      const rows = mergePluginUiRows(state.processes);
      const widths = getColumnWidths(rows);
      const lines = ["", ...renderBanner(description)];
      if (state.proxyTarget) {
        lines.push(renderProxyLine(state.proxyTarget));
      }
      lines.push("");
      for (const section of sectionProcesses(rows)) {
        lines.push(`  ${chalk.bold(colors.cyan(section.title))}`);
        for (const proc of section.processes) {
          lines.push(renderProcessRow(proc, widths.name, widths.source));
          printedRows.set(proc.name, rowKey(proc));
        }
      }
      lines.push("");
      output.write(`${lines.join("\n")}\n`);
    };

    const printChanges = () => {
      const rows = mergePluginUiRows(state.processes);
      const widths = getColumnWidths(rows);
      for (const row of rows) {
        if (printedRows.get(row.name) !== rowKey(row)) {
          printedRows.set(row.name, rowKey(row));
          output.write(`${renderProcessRow(row, widths.name, widths.source)}\n`);
        }
      }
      const ready = rows.length > 0 && rows.every((p) => p.status === "ready");
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
