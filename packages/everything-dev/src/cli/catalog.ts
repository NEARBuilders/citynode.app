import { bosContract } from "../contract";
import { type CliCommandMeta, cliCommandMeta } from "../contract.meta";

export type CommandDescriptor = {
  key: keyof typeof bosContract;
  commandPath: string[];
  summary: string;
  meta: CliCommandMeta;
  procedure: (typeof bosContract)[keyof typeof bosContract];
};

function splitCamelCase(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.toLowerCase());
}

export const commandCatalog: CommandDescriptor[] = (
  Object.entries(bosContract) as Array<
    [keyof typeof bosContract, (typeof bosContract)[keyof typeof bosContract]]
  >
).map(([key, procedure]) => {
  const meta = cliCommandMeta[key as keyof typeof cliCommandMeta] ?? {
    summary: splitCamelCase(String(key)).join(" "),
  };
  return {
    key,
    commandPath: meta.commandPath ?? splitCamelCase(String(key)),
    summary: meta.summary,
    meta,
    procedure,
  };
});

const sortedCommandCatalog = [...commandCatalog].sort(
  (a, b) => b.commandPath.length - a.commandPath.length,
);

export function findCommandDescriptor(
  args: string[],
): { descriptor: CommandDescriptor; consumed: number } | null {
  for (const descriptor of sortedCommandCatalog) {
    const parts = args.slice(0, descriptor.commandPath.length).map((part) => part.toLowerCase());
    if (parts.join(" ") === descriptor.commandPath.join(" ")) {
      return { descriptor, consumed: descriptor.commandPath.length };
    }
  }
  return null;
}
