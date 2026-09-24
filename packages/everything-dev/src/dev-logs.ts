import { existsSync, readdirSync, statSync } from "node:fs";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { stripAnsi } from "./dev-log-pipeline";

export interface LogEntry {
  timestamp: number;
  source: string;
  line: string;
  isError?: boolean;
}

export interface DevLogger {
  logFile: string;
  latestFile: string;
  write: (entry: LogEntry) => Promise<void>;
  readLatest: (opts?: { tail?: number }) => Promise<string>;
}

export function getBosDir(configDir: string): string {
  return join(configDir, ".bos");
}

export function getLogsDir(configDir: string): string {
  return join(getBosDir(configDir), "logs");
}

export function formatLogLine(entry: LogEntry): string {
  const ts = new Date(entry.timestamp).toISOString();
  const prefix = entry.isError ? "ERR" : "OUT";
  const clean = stripAnsi(entry.line);
  const head = `[${ts}] [${entry.source}] [${prefix}] `;
  const pad = " ".repeat(head.length);
  const [first, ...rest] = clean.split("\n");
  return [`${head}${first}`, ...rest.map((line) => `${pad}${line}`)].join("\n");
}

export async function createDevLogger(configDir: string, description: string): Promise<DevLogger> {
  const dir = getLogsDir(configDir);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }

  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const logFile = join(dir, `dev-${ts}-${process.pid}.log`);
  const latestFile = join(dir, `dev-latest-${process.pid}.log`);

  const header =
    `# everything-dev dev session: ${description}\n` + `# Started: ${now.toISOString()}\n\n`;
  // Overwrite each run so dev-latest.log is always actionable.
  await writeFile(logFile, header, "utf8");
  await writeFile(latestFile, header, "utf8");

  let chain = Promise.resolve();
  const enqueue = (fn: () => Promise<void>) => {
    chain = chain.then(fn, fn);
    return chain;
  };

  return {
    logFile,
    latestFile,
    write: (entry) =>
      enqueue(async () => {
        const line = `${formatLogLine(entry)}\n`;
        await appendFile(logFile, line);
        await appendFile(latestFile, line);
      }),
    readLatest: async (opts) => {
      const text = await readFile(latestFile, "utf8").catch(() => "");
      const tail = opts?.tail;
      if (!tail || tail <= 0) return text;
      const lines = text.split("\n");
      return lines.slice(Math.max(0, lines.length - tail)).join("\n");
    },
  };
}

export function resolveDevLatestFile(configDir: string): string {
  const dir = getLogsDir(configDir);
  const latestFile = join(dir, "dev-latest.log");
  if (existsSync(latestFile)) return latestFile;
  const candidates = readdirSync(dir)
    .filter((name) => name.startsWith("dev-latest-") && name.endsWith(".log"))
    .map((name) => {
      const stats = statSync(join(dir, name));
      return { name, mtimeMs: stats.mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates.length > 0 ? join(dir, candidates[0]!.name) : latestFile;
}

export async function readDevLatestLog(
  configDir: string,
  opts?: { tail?: number },
): Promise<string> {
  const latestFile = resolveDevLatestFile(configDir);
  const text = await readFile(latestFile, "utf8").catch(() => "");
  const tail = opts?.tail;
  if (!tail || tail <= 0) return text;
  const lines = text.split("\n");
  return lines.slice(Math.max(0, lines.length - tail)).join("\n");
}
