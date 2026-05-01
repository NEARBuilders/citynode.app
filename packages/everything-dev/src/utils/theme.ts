import chalk from "chalk";
import gradient from "gradient-string";

export const gradients: Record<string, (text: string) => string> = {
  cyber: gradient(["#00ffff", "#ff00ff"]),
};

export const colors = {
  cyan: chalk.hex("#00ffff"),
  magenta: chalk.hex("#ff00ff"),
  green: chalk.hex("#00ff41"),
  blue: chalk.hex("#0080ff"),
  yellow: chalk.hex("#ffcc00"),
  white: chalk.hex("#f0f0f0"),
  gray: chalk.hex("#555555"),
  dim: chalk.dim,
  error: chalk.hex("#ff3366"),
};

export const icons = {
  scan: "○",
  run: "▶",
  ok: "✓",
  err: "✗",
  pending: "○",
  arrow: "→",
  dot: "·",
  app: "◉",
  config: "⚙",
};

export const frames = {
  top: (width: number) => `┌${"─".repeat(width - 2)}┐`,
  bottom: (width: number) => `└${"─".repeat(width - 2)}┘`,
};

export function divider(width = 48): string {
  return colors.dim("─".repeat(width));
}
