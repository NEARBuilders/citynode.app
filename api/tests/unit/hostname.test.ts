import { describe, expect, it } from "vitest";
import { isReservedGatewayHostname, isValidHostname, normalizeHostname } from "@/lib/hostname";

const gateway = ["citynode.app", "dev.citynode.app"];

describe("normalizeHostname", () => {
  it("trims, lowercases and drops one trailing dot", () => {
    expect(normalizeHostname("  WWW.CityNode.App.  ")).toBe("www.citynode.app");
  });

  it("keeps a second trailing dot so it fails validation", () => {
    expect(isValidHostname(normalizeHostname("www.citynode.app.."))).toBe(false);
  });
});

describe("isValidHostname", () => {
  it("accepts a hostname longer than 64 characters when every label is valid", () => {
    expect(isValidHostname(`${"a".repeat(60)}.citynode.app`)).toBe(true);
  });

  it("accepts a 63-character label and rejects a 64-character label", () => {
    expect(isValidHostname(`${"a".repeat(63)}.citynode.app`)).toBe(true);
    expect(isValidHostname(`${"a".repeat(64)}.citynode.app`)).toBe(false);
  });

  it("enforces the 253-character overall limit", () => {
    const label = "a".repeat(62);
    expect(isValidHostname(`${label}.${label}.${label}.${label}`)).toBe(true);
    expect(isValidHostname(`${label}.${label}.${label}.${label}.abc`)).toBe(false);
  });

  it.each([
    "",
    "-a.citynode.app",
    "a-.citynode.app",
    "a..citynode.app",
    "a b.citynode.app",
    "a_b.citynode.app",
    "ａｐｉ.citynode.app",
  ])("rejects %j", (hostname) => {
    expect(isValidHostname(hostname)).toBe(false);
  });
});

describe("isReservedGatewayHostname", () => {
  it.each([
    "www",
    "admin",
    "api",
    "auth",
    "login",
    "docs",
    "staging",
  ])("reserves %s under every gateway domain", (label) => {
    expect(isReservedGatewayHostname(`${label}.citynode.app`, gateway)).toBe(true);
    expect(isReservedGatewayHostname(`${label}.dev.citynode.app`, gateway)).toBe(true);
  });

  it("reserves a reserved label at any depth below the gateway domain", () => {
    expect(isReservedGatewayHostname("shop.admin.citynode.app", gateway)).toBe(true);
    expect(isReservedGatewayHostname("app.auth.dev.citynode.app", gateway)).toBe(true);
  });

  it("reserves the gateway domain itself", () => {
    expect(isReservedGatewayHostname("citynode.app", gateway)).toBe(true);
    expect(isReservedGatewayHostname("dev.citynode.app", gateway)).toBe(true);
  });

  it("reserves dotless reserved labels", () => {
    expect(isReservedGatewayHostname("www", gateway)).toBe(true);
    expect(isReservedGatewayHostname("chicago", gateway)).toBe(false);
  });

  it("reserves a dotless name that expands to another gateway domain", () => {
    expect(isReservedGatewayHostname("dev", gateway)).toBe(true);
    const deployed = ["citynode.app", "testnet.citynode.app"];
    expect(isReservedGatewayHostname("testnet", deployed)).toBe(true);
    expect(isReservedGatewayHostname("chicago", deployed)).toBe(false);
    expect(isReservedGatewayHostname("testnet", [])).toBe(false);
  });

  it("leaves ordinary tenant names and custom domains alone", () => {
    expect(isReservedGatewayHostname("chicago.citynode.app", gateway)).toBe(false);
    expect(isReservedGatewayHostname("wwwchicago.citynode.app", gateway)).toBe(false);
    expect(isReservedGatewayHostname("www.example.com", gateway)).toBe(false);
    expect(isReservedGatewayHostname("admin.citynode.app.evil.com", gateway)).toBe(false);
    expect(isReservedGatewayHostname("www.citynode.app", [])).toBe(false);
  });
});
