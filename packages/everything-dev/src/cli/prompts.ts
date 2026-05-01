import { createInterface } from "node:readline";

export async function prompt(question: string, defaultValue?: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const suffix = defaultValue ? ` [${defaultValue}]` : "";
  const fullQuestion = `${question}${suffix}: `;

  return new Promise<string>((resolve) => {
    rl.question(fullQuestion, (answer) => {
      rl.close();
      const trimmed = answer.trim();
      resolve(trimmed || defaultValue || "");
    });
  });
}

export async function promptYesNo(question: string, defaultVal = false): Promise<boolean> {
  const hint = defaultVal ? "Y/n" : "y/N";
  const answer = await prompt(`${question} (${hint})`);
  if (!answer) return defaultVal;
  return answer.toLowerCase() === "y" || answer.toLowerCase() === "yes";
}

function parseExtendsRef(ref: string): { account: string; gateway: string } | null {
  const match = ref.match(/^(?:bos:\/\/)?([^/]+)\/(.+)$/);
  if (!match) return null;
  return { account: match[1], gateway: match[2] };
}

function deriveAccountFromDomain(domain: string, extendsAccount: string): string {
  const firstSegment = domain.split(".")[0];
  if (!firstSegment) return "";
  const suffix = extendsAccount.includes(".")
    ? extendsAccount.substring(extendsAccount.indexOf(".") + 1)
    : extendsAccount;
  return `${firstSegment}.${suffix}`;
}

const AVAILABLE_PLUGINS = [
  {
    key: "_template",
    label: "template",
    description: "Plugin scaffold and boilerplate",
    default: true,
  },
  {
    key: "registry",
    label: "registry",
    description: "FastKV app discovery and metadata",
    default: false,
  },
];

async function promptPluginSelect(): Promise<string[]> {
  const selected = new Set<string>(AVAILABLE_PLUGINS.filter((p) => p.default).map((p) => p.key));

  console.log();
  console.log("  Select plugins (enter number to toggle, enter to confirm):");
  for (let i = 0; i < AVAILABLE_PLUGINS.length; i++) {
    const p = AVAILABLE_PLUGINS[i];
    const marker = selected.has(p.key) ? "●" : "○";
    console.log(`    ${marker} ${i + 1}. ${p.label} — ${p.description}`);
  }
  console.log();

  while (true) {
    const answer = await prompt(
      "  Plugins",
      selected.size > 0 ? Array.from(selected).join(",") : "",
    );
    if (!answer) break;

    const num = Number.parseInt(answer, 10);
    if (num >= 1 && num <= AVAILABLE_PLUGINS.length) {
      const plugin = AVAILABLE_PLUGINS[num - 1];
      if (selected.has(plugin.key)) {
        selected.delete(plugin.key);
      } else {
        selected.add(plugin.key);
      }

      console.log("  Current selection:");
      for (let i = 0; i < AVAILABLE_PLUGINS.length; i++) {
        const p = AVAILABLE_PLUGINS[i];
        const marker = selected.has(p.key) ? "●" : "○";
        console.log(`    ${marker} ${i + 1}. ${p.label}`);
      }
      console.log();
      continue;
    }

    break;
  }

  return Array.from(selected);
}

export async function promptInitOptions(input: {
  extendsAccount?: string;
  extendsGateway?: string;
  extends?: string;
  directory?: string;
  account?: string;
  domain?: string;
  plugins?: string[];
  withHost?: boolean;
}): Promise<{
  extendsAccount: string;
  extendsGateway: string;
  directory: string;
  account?: string;
  domain?: string;
  plugins: string[];
  withHost: boolean;
}> {
  const domain = input.domain || (await prompt("Project domain"));

  const extendsInput = input.extends || (await prompt("Extend from", ""));
  let extendsAccount = input.extendsAccount || "";
  let extendsGateway = input.extendsGateway || "";

  if (extendsInput) {
    const parsed = parseExtendsRef(extendsInput);
    if (parsed) {
      extendsAccount = extendsAccount || parsed.account;
      extendsGateway = extendsGateway || parsed.gateway;
    }
  }

  extendsAccount = extendsAccount || "dev.everything.near";
  extendsGateway = extendsGateway || "everything.dev";

  const accountDefault = domain ? deriveAccountFromDomain(domain, extendsAccount) : "";
  const account = input.account || (await prompt("Project NEAR account", accountDefault));

  const directory = input.directory || domain || extendsGateway;

  const plugins = input.plugins || (await promptPluginSelect());

  const withHost =
    input.withHost !== undefined ? input.withHost : await promptYesNo("Include host?", false);

  return {
    extendsAccount,
    extendsGateway,
    directory,
    account: account || undefined,
    domain: domain || undefined,
    plugins,
    withHost,
  };
}
