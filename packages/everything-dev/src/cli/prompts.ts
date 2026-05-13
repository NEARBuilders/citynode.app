import process from "node:process";
import * as p from "@clack/prompts";
import type { OverrideSection } from "../contract";

function parseExtendsRef(ref: string): { account: string; gateway: string } | null {
  const normalized = ref.startsWith("bos://") ? ref : `bos://${ref}`;
  const match = normalized.match(/^bos:\/\/([^/]+)\/(.+)$/);
  if (!match) return null;
  return { account: match[1], gateway: match[2] };
}

function deriveAccountFromExtends(domain: string, extendsAccount: string): string {
  const firstSegment = domain.split(".")[0];
  if (!firstSegment) return "";
  const suffix = extendsAccount.includes(".")
    ? extendsAccount.substring(extendsAccount.indexOf(".") + 1)
    : extendsAccount;
  return `${firstSegment}.${suffix}`;
}

const OVERRIDE_OPTIONS: { value: OverrideSection; label: string; hint: string }[] = [
  { value: "ui", label: "ui", hint: "Override UI with local source" },
  { value: "api", label: "api", hint: "Override API with local source" },
  { value: "host", label: "host", hint: "Override host with local source" },
  { value: "plugins", label: "plugins", hint: "Override selected plugins with local source" },
];

export async function promptInitOptions(input: {
  extends?: string;
  directory?: string;
  account?: string;
  domain?: string;
  plugins?: string[];
  overrides?: OverrideSection[];
  parentPluginKeys?: string[];
}): Promise<{
  extendsAccount: string;
  extendsGateway: string;
  directory: string;
  account?: string;
  domain?: string;
  plugins: string[];
  overrides: OverrideSection[];
}> {
  p.intro("Let's build an app...");

  const extendsInput =
    input.extends ??
    ((await p.text({
      message: "Extending an existing app?",
      placeholder: "bos://dev.everything.near/everything.dev",
    })) as string);

  if (p.isCancel(extendsInput)) process.exit(0);

  let extendsAccount = "dev.everything.near";
  let extendsGateway = "everything.dev";

  if (extendsInput) {
    const parsed = parseExtendsRef(extendsInput);
    if (parsed) {
      extendsAccount = parsed.account;
      extendsGateway = parsed.gateway;
    }
  }

  const domain =
    input.domain ??
    ((await p.text({
      message: "Starting with a domain?",
      placeholder: "no",
    })) as string);

  if (p.isCancel(domain)) process.exit(0);

  const accountDefault = domain ? deriveAccountFromExtends(domain, extendsAccount) : "";
  const account =
    input.account ??
    ((await p.text({
      message: "What NEAR account will you publish from?",
      placeholder: accountDefault || "skip",
      defaultValue: accountDefault,
    })) as string);

  if (p.isCancel(account)) process.exit(0);

  const directory = input.directory || domain || extendsGateway;

  const overrides =
    input.overrides ??
    ((await p.multiselect({
      message: "Which sections to override locally?",
      options: OVERRIDE_OPTIONS,
      initialValues: ["ui", "api"] as OverrideSection[],
      required: false,
    })) as OverrideSection[]);

  if (p.isCancel(overrides)) process.exit(0);

  let plugins: string[] = [];
  if (overrides.includes("plugins")) {
    const parentPlugins = input.parentPluginKeys ?? [];
    const pluginOptions =
      parentPlugins.length > 0 ? parentPlugins.map((key) => ({ value: key, label: key })) : [];

    plugins =
      input.plugins ??
      (pluginOptions.length > 0
        ? ((await p.multiselect({
            message: "Select plugins to include:",
            options: pluginOptions,
            required: false,
          })) as string[])
        : []);

    if (p.isCancel(plugins)) process.exit(0);
  }

  const go = await p.confirm({
    message: "GO!",
    initialValue: true,
  });

  if (p.isCancel(go) || !go) process.exit(0);

  return {
    extendsAccount,
    extendsGateway,
    directory,
    account: account || undefined,
    domain: domain || undefined,
    plugins,
    overrides,
  };
}
