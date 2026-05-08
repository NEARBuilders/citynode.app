import { spawn } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { Effect } from "effect";

export interface NearTransactionConfig {
  account: string;
  contract: string;
  method: string;
  argsBase64: string;
  network?: "mainnet" | "testnet";
  privateKey?: string;
  gas?: string;
  deposit?: string;
}

export interface NearTransactionResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

export interface NearKeyPair {
  publicKey: string;
  privateKey: string;
}

export interface FunctionCallAccessKeyConfig {
  account: string;
  contract: string;
  allowance: string;
  functionNames: string[];
  network?: "mainnet" | "testnet";
}

const NEAR_CLI_VERSION = "0.23.5";
const INSTALLER_URL = `https://github.com/near/near-cli-rs/releases/download/v${NEAR_CLI_VERSION}/near-cli-rs-installer.sh`;
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export class NearCliNotFoundError extends Error {
  readonly _tag = "NearCliNotFoundError";
  constructor() {
    super("NEAR CLI not found");
  }
}

export class NearCliInstallError extends Error {
  readonly _tag = "NearCliInstallError";
  constructor(message: string) {
    super(`Failed to install NEAR CLI: ${message}`);
  }
}

export class NearTransactionError extends Error {
  readonly _tag = "NearTransactionError";
}

function base64UrlToBytes(input: string): Uint8Array {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  return new Uint8Array(Buffer.from(normalized, "base64"));
}

function base58Encode(input: Uint8Array): string {
  if (input.length === 0) return "";

  const digits: number[] = [0];
  for (const byte of input) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i]! << 8;
      digits[i] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }

  let output = "";
  for (const byte of input) {
    if (byte === 0) output += BASE58_ALPHABET[0];
    else break;
  }

  for (let i = digits.length - 1; i >= 0; i--) {
    output += BASE58_ALPHABET[digits[i]!]!;
  }

  return output;
}

export function generateNearKeyPair(): NearKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicJwk = publicKey.export({ format: "jwk" }) as JsonWebKey;
  const privateJwk = privateKey.export({ format: "jwk" }) as JsonWebKey;

  if (!publicJwk.x || !privateJwk.d) {
    throw new Error("Failed to generate NEAR keypair");
  }

  const publicBytes = base64UrlToBytes(publicJwk.x);
  const privateSeed = base64UrlToBytes(privateJwk.d);
  const secretBytes = new Uint8Array(privateSeed.length + publicBytes.length);
  secretBytes.set(privateSeed, 0);
  secretBytes.set(publicBytes, privateSeed.length);

  return {
    publicKey: `ed25519:${base58Encode(publicBytes)}`,
    privateKey: `ed25519:${base58Encode(secretBytes)}`,
  };
}

const checkNearCliInstalled = Effect.tryPromise({
  try: async () => {
    return await new Promise<boolean>((resolve) => {
      const proc = spawn("near", ["--version"], { stdio: "pipe" });
      proc.on("close", (code) => resolve(code === 0));
      proc.on("error", () => resolve(false));
    });
  },
  catch: () => new Error("Failed to check NEAR CLI"),
});

const installNearCli = Effect.tryPromise({
  try: async () => {
    return await new Promise<void>((resolve, reject) => {
      const proc = spawn(
        "sh",
        ["-c", `curl --proto '=https' --tlsv1.2 -LsSf ${INSTALLER_URL} | sh`],
        {
          stdio: "inherit",
        },
      );

      proc.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new NearCliInstallError(`Installer exited with code ${code}`));
      });
      proc.on("error", (err) => reject(new NearCliInstallError(err.message)));
    });
  },
  catch: (error) => error as Error,
});

async function runNearCommand(args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn("near", args, {
      stdio: "inherit",
    });

    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`near ${args.join(" ")} failed with exit code ${code}`));
    });

    proc.on("error", (err) => reject(new Error(err.message)));
  });
}

export const ensureNearCli = Effect.gen(function* () {
  const isInstalled = yield* checkNearCliInstalled;
  if (isInstalled) return;

  if (process.env.BOS_INSTALL_NEAR_CLI === "true") {
    yield* installNearCli;
    return;
  }

  console.log();
  console.log("  NEAR CLI not found");

  console.log();
  console.log(`  To install manually: curl --proto '=https' --tlsv1.2 -LsSf ${INSTALLER_URL} | sh`);
  console.log();
  yield* Effect.fail(new NearCliNotFoundError());
});

export const executeTransaction = (
  config: NearTransactionConfig,
): Effect.Effect<NearTransactionResult, Error> =>
  Effect.gen(function* () {
    const gas = (config.gas || "300Tgas").replace(/\s+/g, "");
    const deposit = (config.deposit || "0NEAR").replace(/\s+/g, "");
    const network = config.network || (config.account.endsWith(".testnet") ? "testnet" : "mainnet");

    const args = [
      "contract",
      "call-function",
      "as-transaction",
      config.contract,
      config.method,
      "base64-args",
      config.argsBase64,
      "prepaid-gas",
      gas,
      "attached-deposit",
      deposit,
      "sign-as",
      config.account,
      "network-config",
      network,
    ];

    if (config.privateKey) {
      args.push("sign-with-plaintext-private-key", config.privateKey, "send");
    } else {
      args.push("sign-with-keychain", "send");
    }

    const output = yield* Effect.tryPromise({
      try: async () => {
        return await new Promise<string>((resolve, reject) => {
          const proc = spawn("near", args, { stdio: ["inherit", "pipe", "pipe"] });

          let stdout = "";
          let stderr = "";

          proc.stdout?.on("data", (data) => {
            const text = data.toString();
            stdout += text;
            process.stdout.write(text);
          });

          proc.stderr?.on("data", (data) => {
            const text = data.toString();
            stderr += text;
          });

          proc.on("close", (code) => {
            const combined = `${stdout}\n${stderr}`;
            const txHashMatch = combined.match(/Transaction ID:\s*([A-Za-z0-9]+)/i);
            const hasCodeDoesNotExist = /CodeDoesNotExist/i.test(combined);
            const hasTransactionFailed = /Transaction failed/i.test(combined);
            const softSuccess =
              Boolean(txHashMatch?.[1]) && hasCodeDoesNotExist && hasTransactionFailed;

            if (code === 0 || softSuccess) {
              if (softSuccess) {
                console.log(`  ${txHashMatch?.[1]} — FastDATA CodeDoesNotExist (expected)`);
              }
              resolve(combined);
            } else {
              reject(new NearTransactionError(stderr || `Transaction failed with code ${code}`));
            }
          });

          proc.on("error", (err) => reject(new NearTransactionError(err.message)));
        });
      },
      catch: (error) => error as Error,
    });

    const txHashMatch = output.match(/Transaction ID:\s*([A-Za-z0-9]+)/i);

    return {
      success: true,
      txHash: txHashMatch?.[1],
    };
  });

export async function addFunctionCallAccessKey(
  config: FunctionCallAccessKeyConfig,
): Promise<NearKeyPair> {
  const keyPair = generateNearKeyPair();
  const args = [
    "account",
    "add-key",
    config.account,
    "grant-function-call-access",
    "--allowance",
    config.allowance,
    "--contract-account-id",
    config.contract,
    "--function-names",
    config.functionNames.join(", "),
    "use-manually-provided-public-key",
    keyPair.publicKey,
    "network-config",
    config.network || (config.account.endsWith(".testnet") ? "testnet" : "mainnet"),
    "sign-with-keychain",
    "send",
  ];

  await runNearCommand(args);
  return keyPair;
}
