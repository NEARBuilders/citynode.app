import { execa } from "execa";

type RunResult = { stdout: string; stderr: string; exitCode: number };

export async function run(
  cmd: string,
  args: string[],
  options: {
    cwd?: string;
    env?: Record<string, string>;
    capture?: boolean;
    onChunk?: (stream: "stdout" | "stderr", chunk: Buffer) => void;
  } = {},
): Promise<RunResult | undefined> {
  const proc = execa(cmd, args, {
    cwd: options.cwd,
    env: options.env ? { ...(process.env as Record<string, string>), ...options.env } : process.env,
    stdio: options.capture ? "pipe" : "inherit",
    reject: false,
  });

  if (options.capture && options.onChunk) {
    proc.stdout?.on("data", (chunk: Buffer) => options.onChunk!("stdout", chunk));
    proc.stderr?.on("data", (chunk: Buffer) => options.onChunk!("stderr", chunk));
  }

  await proc;

  if (!options.capture) {
    const exitCode = proc.exitCode ?? 0;
    if (exitCode !== 0) {
      throw new Error(`${cmd} ${args.join(" ")} failed with exit code ${exitCode}`);
    }
    return;
  }

  const result: RunResult = {
    stdout: typeof proc.stdout === "string" ? proc.stdout : "",
    stderr: typeof proc.stderr === "string" ? proc.stderr : "",
    exitCode: proc.exitCode ?? 0,
  };
  return result;
}
