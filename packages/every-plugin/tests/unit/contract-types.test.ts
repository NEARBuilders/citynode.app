import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { contractTypesUpToDate, generateContractTypes } from "../../src/build/contract-types";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "every-plugin-contract-types-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const writeContract = (contents: string) => {
  const filePath = join(dir, "api", "src", "contract.ts");
  mkdirSync(join(filePath, ".."), { recursive: true });
  writeFileSync(filePath, contents);
};

describe("generateContractTypes", () => {
  it("skips workspaces without api/src/contract.ts", async () => {
    expect(await generateContractTypes(dir)).toBe("skipped");
    expect(contractTypesUpToDate(dir)).toBe(false);
  });

  it("throws on the removed src/contract.ts layout", async () => {
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "contract.ts"), `export const contract = { a: 1 };\n`);
    await expect(generateContractTypes(dir)).rejects.toThrow(/api\/src\/contract\.ts/);
  });

  it("generates a fresh declaration and reports up-to-date afterwards", async () => {
    writeContract(`export const contract = { route: (name: string) => name };\n`);
    expect(contractTypesUpToDate(dir)).toBe(false);

    expect(await generateContractTypes(dir)).toBe("generated");
    expect(contractTypesUpToDate(dir)).toBe(true);

    expect(await generateContractTypes(dir)).toBe("up-to-date");
  });

  it("regenerates when contract.ts is newer than the emitted declaration", async () => {
    writeContract(`export const contract = { a: 1 };\n`);
    await generateContractTypes(dir);

    const outFile = join(dir, "types", "contract.d.ts");
    expect(readFileSync(outFile, "utf8")).toContain("contract");

    utimesSync(join(dir, "api", "src", "contract.ts"), new Date(), new Date(Date.now() + 10_000));
    expect(contractTypesUpToDate(dir)).toBe(false);
    expect(await generateContractTypes(dir)).toBe("generated");
  });

  it("reports compile failures with tsc diagnostics", async () => {
    writeContract(`export const contract: number = "not a number";\n`);
    await expect(generateContractTypes(dir)).rejects.toThrow(/tsc exited non-zero/);
  });
});
