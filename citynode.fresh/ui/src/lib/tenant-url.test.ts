import { describe, expect, it } from "vitest";
import { buildTenantUrl, isLocalHostname, tenantLabel } from "./tenant-url";

describe("tenantLabel", () => {
  it("strips the gateway suffix from a full hostname", () => {
    expect(tenantLabel("chicago.citynode.app", "citynode.app")).toBe("chicago");
  });
  it("strips the .localhost suffix", () => {
    expect(tenantLabel("chicago.localhost")).toBe("chicago");
  });
  it("returns the bare label when no suffix matches", () => {
    expect(tenantLabel("chicago")).toBe("chicago");
  });
  it("is case-insensitive", () => {
    expect(tenantLabel("Chicago.CityNode.app", "citynode.app")).toBe("chicago");
  });
  it("trims trailing slashes", () => {
    expect(tenantLabel("chicago.citynode.app/", "citynode.app")).toBe("chicago");
  });
  it("returns the bare label for unrecognized suffixes", () => {
    expect(tenantLabel("chicago.example.com", "citynode.app")).toBe("chicago");
  });
});

describe("isLocalHostname", () => {
  it("matches localhost variants", () => {
    expect(isLocalHostname("localhost")).toBe(true);
    expect(isLocalHostname("127.0.0.1")).toBe(true);
    expect(isLocalHostname("chicago.localhost")).toBe(true);
  });
  it("does not match production hostnames", () => {
    expect(isLocalHostname("chicago.citynode.app")).toBe(false);
  });
});

describe("buildTenantUrl", () => {
  it("returns https in production", () => {
    expect(
      buildTenantUrl("chicago", "citynode.app", { currentHostname: "chicago.citynode.app" }),
    ).toBe("https://chicago.citynode.app");
  });
  it("returns http over localhost, preserving the current port", () => {
    expect(
      buildTenantUrl("chicago", "citynode.app", {
        currentHostname: "localhost",
        currentPort: "3003",
      }),
    ).toBe("http://chicago.localhost:3003");
  });
  it("accepts a full hostname as input", () => {
    expect(
      buildTenantUrl("chicago.citynode.app", "citynode.app", {
        currentHostname: "localhost",
        currentPort: "3000",
      }),
    ).toBe("http://chicago.localhost:3000");
  });
  it("appends a path", () => {
    expect(
      buildTenantUrl("chicago", "citynode.app", {
        currentHostname: "localhost",
        currentPort: "3000",
        path: "/stake",
      }),
    ).toBe("http://chicago.localhost:3000/stake");
  });
  it("returns null when the label is empty", () => {
    expect(buildTenantUrl("", "citynode.app")).toBeNull();
  });
  it("returns null when the gateway id is empty in production", () => {
    expect(
      buildTenantUrl("chicago", "", { currentHostname: "chicago.example.com", path: "/" }),
    ).toBeNull();
  });
});
