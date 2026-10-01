import { isSecretFieldName } from "../operations/result-projection.js";

const maxDepth = 12;
const maxNodes = 10_000;
const limitMarker = "[redacted: provider query inspection limit reached]";

type Budget = { nodes: number };

function projectArray(value: unknown[], depth: number, budget: Budget): unknown[] {
  const output: unknown[] = [];
  for (const entry of value) {
    if (budget.nodes >= maxNodes) {
      output.push(limitMarker);
      break;
    }
    output.push(projectValue(entry, depth + 1, budget));
  }
  return output;
}

function projectRecord(value: object, depth: number, budget: Budget) {
  const entries: Array<[string, unknown]> = [];
  for (const [key, field] of Object.entries(value)) {
    if (budget.nodes >= maxNodes) {
      entries.push(["result_redacted", true]);
      break;
    }
    if (!isSecretFieldName(key)) entries.push([key, projectValue(field, depth + 1, budget)]);
  }
  return Object.fromEntries(entries);
}

function projectValue(value: unknown, depth: number, budget: Budget): unknown {
  budget.nodes += 1;
  if (budget.nodes > maxNodes || depth > maxDepth) return limitMarker;
  if (Array.isArray(value)) return projectArray(value, depth, budget);
  if (value !== null && typeof value === "object") return projectRecord(value, depth, budget);
  return value;
}

/** Provider query payloads are untyped. Remove bearer-shaped fields before returning them. */
export function projectWalletQueryData(data: Record<string, unknown> | unknown[]) {
  return projectValue(data, 0, { nodes: 0 }) as Record<string, unknown> | unknown[];
}
