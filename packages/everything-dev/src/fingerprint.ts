import { createHash } from "node:crypto";
import type { BosConfig } from "./types";

/**
 * The published pointer's version identity (atomic-deploys 08/12): a hash
 * over every slot's `manifest`/`integrity` pair — cheap to compute (no
 * version-manifest fetch), and stable exactly when the deployed set is.
 * Shared so the CLI and the host compute the same identity for the same
 * pointer.
 */
export function pointerFingerprint(config: BosConfig): string {
  const parts: Array<string> = [];
  const slot = (prefix: string, s: { manifest?: unknown; integrity?: unknown } | undefined) => {
    if (!s) return;
    parts.push(
      `${prefix}:${typeof s.manifest === "string" ? s.manifest : ""}:${typeof s.integrity === "string" ? s.integrity : ""}`,
    );
  };
  for (const [key, entry] of Object.entries(config.app ?? {})) {
    slot(`app.${key}`, entry);
    const ui = (entry as { ui?: { manifest?: unknown; integrity?: unknown } }).ui;
    slot(`app.${key}.ui`, ui);
  }
  for (const [key, entry] of Object.entries(config.plugins ?? {})) {
    if (typeof entry === "string") {
      parts.push(`plugins.${key}:${entry}`);
      continue;
    }
    slot(`plugins.${key}`, entry);
    const ui = (entry as { ui?: { manifest?: unknown; integrity?: unknown } }).ui;
    slot(`plugins.${key}.ui`, ui);
  }
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 16);
}

/** Per-slot manifest pin ids for display (slot → versioned manifest filename). */
export function slotPins(config: BosConfig): Record<string, string> {
  const pins: Record<string, string> = {};
  const slot = (prefix: string, s: { manifest?: unknown } | undefined) => {
    if (!s) return;
    if (typeof s.manifest === "string") pins[prefix] = s.manifest;
  };
  for (const [key, entry] of Object.entries(config.app ?? {})) {
    slot(`app.${key}`, entry);
    const ui = (entry as { ui?: { manifest?: unknown } }).ui;
    slot(`app.${key}.ui`, ui);
  }
  for (const [key, entry] of Object.entries(config.plugins ?? {})) {
    if (typeof entry === "string") continue;
    slot(`plugins.${key}`, entry);
    const ui = (entry as { ui?: { manifest?: unknown } }).ui;
    slot(`plugins.${key}.ui`, ui);
  }
  return pins;
}
