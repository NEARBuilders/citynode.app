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

const AVAILABLE_PLUGINS = [{ value: "_template", label: "template" }];

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

  const plugins =
    input.plugins ??
    ((await p.multiselect({
      message: "Select plugins:",
      options: AVAILABLE_PLUGINS,
      initialValues: ["_template"],
      required: false,
    })) as string[]);

  if (p.isCancel(plugins)) process.exit(0);

  const go =
    input.withHost !== undefined
      ? true
      : await p.confirm({
          message: "GO!",
          initialValue: true,
        });

  if (p.isCancel(go) || !go) process.exit(0);

  const withHost = input.withHost ?? false;

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
