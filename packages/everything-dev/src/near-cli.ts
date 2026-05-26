import { generateKeyPairSync } from "node:crypto";
import { Effect } from "effect";
import { execa } from "execa";
import { colors } from "./utils/theme";

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
    try {
      await execa("near", ["--version"], { stdio: "pipe" });
      return true;
    } catch {
      return false;
    }
  },
  catch: () => new Error("Failed to check NEAR CLI"),
});

const installNearCli = Effect.tryPromise({
  try: async () => {
    await execa("sh", ["-c", `curl --proto '=https' --tlsv1.2 -LsSf ${INSTALLER_URL} | sh`], {
      stdin: "ignore",
      stdout: "inherit",
      stderr: "inherit",
    });
  },
  catch: (error) => {
    if (error instanceof Error && "exitCode" in error) {
      return new NearCliInstallError(
        `Installer exited with code ${(error as { exitCode: number }).exitCode}`,
      );
    }
    return new NearCliInstallError(error instanceof Error ? error.message : String(error));
  },
});

async function runNearCommand(args: string[]): Promise<void> {
  await execa("near", args, { stdin: "pipe", stdout: "inherit", stderr: "inherit" });
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
      if (!process.stdin.isTTY) {
        return {
          success: false,
          error:
            "No private key provided and no TTY available for keychain signing. Set NEAR_PRIVATE_KEY environment variable to sign locally.",
        };
      }
      console.log(
        colors.yellow(
          "  Warning: No NEAR_PRIVATE_KEY set — falling back to interactive keychain signing.",
        ),
      );
      args.push("sign-with-keychain", "send");
    }

    const output = yield* Effect.tryPromise({
      try: async () => {
        const result = await execa("near", args, {
          stdin: config.privateKey ? "pipe" : "inherit",
          stdout: "pipe",
          stderr: "pipe",
          reject: false,
        });

        process.stdout.write(result.stdout);
        const combined = `${result.stdout}\n${result.stderr}`;
        const txHashMatch = combined.match(/Transaction ID:\s*([A-Za-z0-9]+)/i);
        const hasCodeDoesNotExist = /CodeDoesNotExist/i.test(combined);
        const hasTransactionFailed = /Transaction failed/i.test(combined);
        const softSuccess =
          Boolean(txHashMatch?.[1]) && hasCodeDoesNotExist && hasTransactionFailed;

        if (result.exitCode === 0 || softSuccess) {
          if (softSuccess) {
            console.log(`  ${txHashMatch?.[1]} — FastDATA CodeDoesNotExist (expected)`);
          }
          return combined;
        }

        throw new NearTransactionError(
          result.stderr || `Transaction failed with code ${result.exitCode}`,
        );
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
