/**
 * The process environment as exported by the parent shell, captured at module
 * init — before any `.env` loading (all dotenv loads happen inside command
 * handlers, never at module scope). Values present here were explicitly
 * provided by the caller (shell, CI, the regression harness) and therefore
 * outrank planner-generated values; values that only exist after `.env`
 * loading do not. Keep this import ahead of any code that loads `.env`.
 */
export const shellEnv: Record<string, string> = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] != null),
);
