import { execa } from "execa";

type RunResult = { stdout: string; stderr: string; exitCode: number };

export async function run(
  cmd: string,
  args: string[],
  options: { cwd?: string; env?: Record<string, string>; capture?: boolean } = {},
): Promise<RunResult | undefined> {
  const proc = await execa(cmd, args, {
    cwd: options.cwd,
    env: options.env ? { ...(process.env as Record<string, string>), ...options.env } : process.env,
    stdio: options.capture ? "pipe" : "inherit",
    reject: false,
  });

  if (!options.capture) {
    const exitCode = proc.exitCode ?? 0;
    if (exitCode !== 0) {
      throw new Error(`${cmd} ${args.join(" ")} failed with exit code ${exitCode}`);
    }
    return;
  }

  const result = {
    stdout: proc.stdout ?? "",
    stderr: proc.stderr ?? "",
    exitCode: proc.exitCode ?? 0,
  };
  return result;
}
