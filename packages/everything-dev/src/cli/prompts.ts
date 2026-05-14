import process from "node:process";
import * as p from "@clack/prompts";

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

export async function promptInitOptions(input: {
  extendsAccount?: string;
  extendsGateway?: string;
  extends?: string;
  directory?: string;
  account?: string;
  domain?: string;
  withUi?: boolean;
  withApi?: boolean;
  plugins?: string[];
  withHost?: boolean;
  parentPluginKeys?: string[];
}): Promise<{
  extendsAccount: string;
  extendsGateway: string;
  directory: string;
  account?: string;
  domain?: string;
  withUi: boolean;
  withApi: boolean;
  plugins: string[];
  withHost: boolean;
}> {
  p.intro("Let's build an app...");

  const domain =
    input.domain ??
    ((await p.text({
      message: "Starting with a domain?",
      placeholder: "no",
    })) as string);

  if (p.isCancel(domain)) process.exit(0);

  const extendsPlaceholder = "bos://dev.everything.near/everything.dev";
  const extendsInput =
    input.extends ??
    ((await p.text({
      message: "Extending an existing app?",
      placeholder: extendsPlaceholder,
    })) as string);

  if (p.isCancel(extendsInput)) process.exit(0);

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
  const account =
    input.account ??
    ((await p.text({
      message: "What NEAR account will you publish from?",
      placeholder: accountDefault || "skip",
      defaultValue: accountDefault,
    })) as string);

  if (p.isCancel(account)) process.exit(0);

  const directory = input.directory || domain || extendsGateway;

  const selectedCustomizations =
    input.withUi !== undefined || input.withApi !== undefined || input.withHost !== undefined
      ? [
          ...((input.withUi ?? true) ? ["ui"] : []),
          ...((input.withApi ?? true) ? ["api"] : []),
          ...((input.withHost ?? false) ? ["host"] : []),
          ...((input.plugins?.length ?? 0) > 0 ? ["plugins"] : []),
        ]
      : ((await p.multiselect({
          message: "What do you want to customize?",
          options: [
            { value: "ui", label: "ui", hint: "local UI code" },
            { value: "api", label: "api", hint: "local API code" },
            { value: "host", label: "host", hint: "local host code" },
            { value: "plugins", label: "plugins", hint: "selected local plugins" },
          ],
          initialValues: ["ui", "api"],
          required: true,
        })) as string[]);

  if (p.isCancel(selectedCustomizations)) process.exit(0);

  const withUi = selectedCustomizations.includes("ui");
  const withApi = selectedCustomizations.includes("api");
  const withHost = selectedCustomizations.includes("host");

  const parentPlugins = input.parentPluginKeys ?? [];
  const pluginOptions =
    parentPlugins.length > 0 ? parentPlugins.map((key) => ({ value: key, label: key })) : [];

  const plugins =
    input.plugins ??
    (selectedCustomizations.includes("plugins") && pluginOptions.length > 0
      ? ((await p.multiselect({
          message: "Select plugins:",
          options: pluginOptions,
          required: false,
        })) as string[])
      : []);

  if (p.isCancel(plugins)) process.exit(0);

  const go =
    input.withHost !== undefined
      ? true
      : await p.confirm({
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
    withUi,
    withApi,
    plugins,
    withHost,
  };
}
