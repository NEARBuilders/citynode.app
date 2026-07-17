import { describe, expect, it } from "vitest";
import { unwrapDatabaseError } from "../../src/db/index";

describe("unwrapDatabaseError", () => {
  it("returns message from a plain Error", () => {
    expect(unwrapDatabaseError(new Error("pool error"))).toBe("pool error");
  });

  it("walks a single-level cause chain", () => {
    const inner = new Error("relation does not exist");
    const outer = new Error("Failed query: select 1", { cause: inner });
    expect(unwrapDatabaseError(outer)).toBe("Failed query: select 1: relation does not exist");
  });

  it("walks a multi-level cause chain", () => {
    const root = new Error("root pg cause");
    const mid = new Error("drizzle wrapper", { cause: root });
    const top = new Error("DatabaseError", { cause: mid });
    expect(unwrapDatabaseError(top)).toBe("DatabaseError: drizzle wrapper: root pg cause");
  });

  it("stringifies non-Error input", () => {
    expect(unwrapDatabaseError("just a string")).toBe("just a string");
    expect(unwrapDatabaseError(42)).toBe("42");
  });
});
