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

function deriveDirectoryFromDomain(domain: string): string {
  const firstSegment = domain.split(".")[0];
  return firstSegment || domain;
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
  directory?: string;
  account?: string;
  domain?: string;
  withHost?: boolean;
}): Promise<{
  extendsAccount: string;
  extendsGateway: string;
  directory: string;
  account?: string;
  domain?: string;
  withHost: boolean;
}> {
  const extendsAccount =
    input.extendsAccount || (await prompt("Extends account", "dev.everything.near"));

  const extendsGateway =
    input.extendsGateway || (await prompt("Extends gateway", "everything.dev"));

  const domain = input.domain || (await prompt("Project domain"));

  const accountDefault = domain ? deriveAccountFromDomain(domain, extendsAccount) : "";
  const account = input.account || (await prompt("Project NEAR account", accountDefault));

  const directoryDefault = domain ? deriveDirectoryFromDomain(domain) : extendsGateway;
  const directory = input.directory || (await prompt("Project directory", directoryDefault));

  const withHost =
    input.withHost !== undefined ? input.withHost : await promptYesNo("Include host?", false);

  return {
    extendsAccount,
    extendsGateway,
    directory,
    account: account || undefined,
    domain: domain || undefined,
    withHost,
  };
}
