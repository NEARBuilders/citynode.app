import { describe, expect, it } from "vitest";
import { flattenError } from "../../src/lib/context";

describe("flattenError", () => {
  it("returns message from a plain Error", () => {
    expect(flattenError(new Error("simple error"))).toBe("simple error");
  });

  it("walks a single-level cause chain", () => {
    const inner = new Error("relation does not exist");
    const outer = new Error("Failed query: select 1", { cause: inner });
    expect(flattenError(outer)).toBe("Failed query: select 1: relation does not exist");
  });

  it("walks a multi-level cause chain", () => {
    const root = new Error("root cause");
    const mid = new Error("middle", { cause: root });
    const top = new Error("top", { cause: mid });
    expect(flattenError(top)).toBe("top: middle: root cause");
  });

  it("stops at non-Error cause", () => {
    const outer = new Error("wrapped", { cause: "string cause" });
    expect(flattenError(outer)).toBe("wrapped");
  });

  it("stringifies non-Error input", () => {
    expect(flattenError("just a string")).toBe("just a string");
    expect(flattenError(42)).toBe("42");
    expect(flattenError(null)).toBe("null");
    expect(flattenError(undefined)).toBe("undefined");
  });
});
