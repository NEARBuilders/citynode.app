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

export async function promptInitOptions(input: {
  account?: string;
  gateway?: string;
  destination?: string;
  name?: string;
  domain?: string;
  withHost?: boolean;
}): Promise<{
  account: string;
  gateway: string;
  destination: string;
  name?: string;
  domain?: string;
  withHost: boolean;
}> {
  const account = input.account || (await prompt("NEAR account", "dev.everything.near"));

  const gateway = input.gateway || (await prompt("Gateway ID", "everything.dev"));

  const destination = input.destination || (await prompt("Project directory", gateway));

  const name = input.name || (await prompt("New project NEAR account (optional)", ""));

  const domain = input.domain || (await prompt("New project domain (optional)", ""));

  const withHost =
    input.withHost !== undefined ? input.withHost : await promptYesNo("Include host?", false);

  return {
    account,
    gateway,
    destination,
    name: name || undefined,
    domain: domain || undefined,
    withHost,
  };
}
