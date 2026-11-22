import { describe, expect, it } from "vitest";
import { isReservedGatewayHostname, isValidHostname, normalizeHostname } from "@/lib/hostname";

describe("hostname canonicalization", () => {
  it.each([
    ["  ADMIN.CityNode.App.  ", "admin.citynode.app"],
    ["ＡＤＭＩＮ。citynode.app。", "admin.citynode.app"],
    ["a\u200bdmin.citynode.app", "admin.citynode.app"],
    ["BÜCHER.citynode.app.", "xn--bcher-kva.citynode.app"],
    ["XN--BCHER-KVA.citynode.app", "xn--bcher-kva.citynode.app"],
  ])("canonicalizes %s", (input, expected) => {
    expect(normalizeHostname(input)).toBe(expected);
  });

  it.each([
    "",
    "   ",
    "a..b",
    "-a.citynode.app",
    "a-.citynode.app",
    "xn--.app",
    "a b.app",
    "a.app/path",
    "a.app:443",
    "a@b.app",
    "a.app?x",
    "a.app#x",
    "%61dmin.app",
    "a\\b.app",
    `${"a".repeat(64)}.app`,
  ])("rejects invalid DNS input %s", (input) =>
    expect(isValidHostname(normalizeHostname(input))).toBe(false));

  it("enforces ASCII label and total hostname limits rather than a 64-character host limit", () => {
    const maximum = `${"a".repeat(63)}.${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(61)}`;
    expect(maximum).toHaveLength(253);
    expect(isValidHostname(maximum)).toBe(true);
    expect(isValidHostname(`${maximum}e`)).toBe(false);
    expect(isValidHostname(`${"a".repeat(63)}.citynode.app`)).toBe(true);
  });

  it.each([
    "www",
    "admin",
    "api",
    "auth",
    "login",
    "docs",
    "staging",
  ])("reserves %s at every gateway prefix level but not on custom domains", (label) => {
    for (const hostname of [
      label,
      `${label}.citynode.app`,
      `app.${label}.citynode.app`,
      `${label}.app.citynode.app`,
    ]) {
      expect(isReservedGatewayHostname(hostname, ["citynode.app"])).toBe(true);
    }
    expect(isReservedGatewayHostname(`${label}.example.com`, ["citynode.app"])).toBe(false);
  });

  it("protects gateway apexes without treating suffix lookalikes as gateway hosts", () => {
    expect(isReservedGatewayHostname("citynode.app", ["citynode.app"])).toBe(true);
    expect(isReservedGatewayHostname("admin.citynode.app.example", ["citynode.app"])).toBe(false);
    expect(isReservedGatewayHostname("admin.notcitynode.app", ["citynode.app"])).toBe(false);
    expect(isReservedGatewayHostname("www-citynode.citynode.app", ["citynode.app"])).toBe(false);
  });
});
