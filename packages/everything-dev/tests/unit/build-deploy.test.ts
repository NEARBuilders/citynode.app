import { describe, expect, it } from "vitest";
import { extractPublishedUrl } from "../../src/publish";

const ZE_REGEX_OLD = /ZE\d+/;
const ZE_REGEX_NEW = /ZE\d{4,}/;

describe("ZE error regex tightening", () => {
  it("matches Zephyr error ZE10037 with 4+ digit regex", () => {
    expect(ZE_REGEX_NEW.test("ZE10037: ci-token-exchange returned 401")).toBe(true);
  });

  it("matches Zephyr error ZE99999 with 4+ digit regex", () => {
    expect(ZE_REGEX_NEW.test("Error: ZE99999 something went wrong")).toBe(true);
  });

  it("matches 4-digit ZE code with 4+ digit regex", () => {
    expect(ZE_REGEX_NEW.test("ZE1234: some error")).toBe(true);
  });

  it("does NOT match ZE1 with 4+ digit regex", () => {
    expect(ZE_REGEX_NEW.test("ZE1")).toBe(false);
  });

  it("does NOT match ZE12 with 4+ digit regex", () => {
    expect(ZE_REGEX_NEW.test("ZE12")).toBe(false);
  });

  it("does NOT match ZE123 with 4+ digit regex", () => {
    expect(ZE_REGEX_NEW.test("ZE123")).toBe(false);
  });

  it("does NOT match accidental patterns like vZE100 in a version string", () => {
    expect(ZE_REGEX_NEW.test("vZE100-info")).toBe(false);
  });

  it("does NOT match 'size: 42' or other non-ZE patterns", () => {
    expect(ZE_REGEX_NEW.test("size: 42")).toBe(false);
  });

  it("still matches ZE10037 with old regex (regression check)", () => {
    expect(ZE_REGEX_OLD.test("ZE10037: ci-token-exchange returned 401")).toBe(true);
  });

  it("old regex falsely matches ZE1 (false positive)", () => {
    expect(ZE_REGEX_OLD.test("ZE1")).toBe(true);
  });

  it("ZE10037 is extracted correctly from error message", () => {
    const match = "ZE10037: ci-token-exchange returned 401".match(ZE_REGEX_NEW);
    expect(match).not.toBeNull();
    expect(match![0]).toBe("ZE10037");
  });
});

describe("extractPublishedUrl", () => {
  it("extracts URL from deployed message with rocket emoji", () => {
    const output = "🚀 API Deployed: https://example.zephyrcloud.app/123";
    expect(extractPublishedUrl(output)).toBe("https://example.zephyrcloud.app/123");
  });

  it("extracts URL from generic http match", () => {
    const output = "Some output https://example.com/deploy-url more text";
    expect(extractPublishedUrl(output)).toBe("https://example.com/deploy-url");
  });

  it("returns null when no URL present", () => {
    expect(extractPublishedUrl("no url here")).toBeNull();
  });

  it("prefers rocket deploy URL over generic URL", () => {
    const output = "info: https://other.com\n🚀 Host Deployed: https://zephyr.app/host\n";
    expect(extractPublishedUrl(output)).toBe("https://zephyr.app/host");
  });
});

describe("warning extraction logic", () => {
  const errorLineFilter = (line: string) =>
    /\bERROR\b/.test(line) || line.startsWith("Rspack compiled with");

  it("extracts ERROR lines from build output", () => {
    const output = `[webpack] some log
ERROR in ./src/index.ts
[webpack] more log
Rspack compiled with 2 errors`;
    const errorLines = output.split("\n").filter(errorLineFilter).slice(0, 5);
    expect(errorLines).toHaveLength(2);
    expect(errorLines[0]).toBe("ERROR in ./src/index.ts");
    expect(errorLines[1]).toBe("Rspack compiled with 2 errors");
  });

  it("returns empty array when no errors", () => {
    const output = `[webpack] log line 1
[webpack] log line 2
🚀 Deployed: https://example.com`;
    const errorLines = output.split("\n").filter(errorLineFilter).slice(0, 5);
    expect(errorLines).toHaveLength(0);
  });

  it("limits to 5 error lines", () => {
    const lines = Array.from({ length: 10 }, (_, i) => `ERROR line ${i}`);
    const output = lines.join("\n");
    const errorLines = output.split("\n").filter(errorLineFilter).slice(0, 5);
    expect(errorLines).toHaveLength(5);
  });
});

describe("parseDeployLines inline test", () => {
  const parseDeployLines = (output: string): Array<{ url: string; urlField: string }> => {
    const results: Array<{ url: string; urlField: string }> = [];
    for (const line of output.split("\n")) {
      if (!line.includes("[BOS_DEPLOY]")) continue;
      const urlMatch = line.match(/url=(\S+)/);
      const urlFieldMatch = line.match(/urlField=(\S+)/);
      if (!urlMatch || !urlFieldMatch) continue;
      results.push({ url: urlMatch[1], urlField: urlFieldMatch[1] });
    }
    return results;
  };

  it("parses single [BOS_DEPLOY] line", () => {
    const output =
      "[BOS_DEPLOY] url=https://cdn.example urlField=app.ui.production integrityField=app.ui.integrity integrity=sha384-abc";
    const entries = parseDeployLines(output);
    expect(entries).toHaveLength(1);
    expect(entries[0].url).toBe("https://cdn.example");
    expect(entries[0].urlField).toBe("app.ui.production");
  });

  it("parses multiple [BOS_DEPLOY] lines", () => {
    const output = `[BOS_DEPLOY] url=https://a.example urlField=app.ui.production
[BOS_DEPLOY] url=https://b.example urlField=app.api.production`;
    const entries = parseDeployLines(output);
    expect(entries).toHaveLength(2);
    expect(entries[1].url).toBe("https://b.example");
  });

  it("returns empty for output without [BOS_DEPLOY]", () => {
    const output = "🚀 API Deployed: https://example.com";
    const entries = parseDeployLines(output);
    expect(entries).toHaveLength(0);
  });
});
