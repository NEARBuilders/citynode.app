import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStorageClient } from "../../src/services/storage";
import { authedContext, getPluginClient, teardown } from "../setup";

const account = "bundles.near";
const gateway = "bundles.example.com";

const context = {
  ...authedContext("user-bundles"),
  near: { primaryAccountId: account, linkedAccounts: [], hasNearAccount: true },
};

const encode = (text: string) => Buffer.from(text).toString("base64");

const upload = async (files: Array<{ path: string; contentBase64: string }>) => {
  const client = await getPluginClient(context);
  return client.uploadStorageBundle({ account, gateway, workspace: "ui", files });
};

describe("uploadStorageBundle", () => {
  const originalCeiling = process.env.BOS_MAX_BUNDLE_UPLOAD_BYTES;
  let puts: string[];
  let failKey: string | null;

  beforeEach(() => {
    puts = [];
    failKey = null;
    const put = MemoryStorageClient.prototype.put;
    vi.spyOn(MemoryStorageClient.prototype, "put").mockImplementation(async function (
      this: MemoryStorageClient,
      input,
    ) {
      if (failKey && input.key.endsWith(failKey)) throw new Error("storage unavailable");
      puts.push(input.key);
      await put.call(this, input);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalCeiling === undefined) delete process.env.BOS_MAX_BUNDLE_UPLOAD_BYTES;
    else process.env.BOS_MAX_BUNDLE_UPLOAD_BYTES = originalCeiling;
  });

  afterAll(teardown);

  it("stores valid files and returns their integrity hashes", async () => {
    const result = await upload([
      { path: "remoteEntry.js", contentBase64: encode("entry") },
      { path: "static/js/main.1234abcd5678ef90.js", contentBase64: encode("main") },
    ]);

    expect(result.stored).toBe(2);
    expect(result.totalBytes).toBe("entry".length + "main".length);
    expect(Object.keys(result.integrity).sort()).toEqual([
      "remoteEntry.js",
      "static/js/main.1234abcd5678ef90.js",
    ]);
  });

  it("rejects malformed base64 and stores nothing", async () => {
    await expect(
      upload([
        { path: "static/js/ok.1234abcd5678ef90.js", contentBase64: encode("ok") },
        { path: "remoteEntry.js", contentBase64: "!!!not*base64!!!" },
      ]),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(puts).toEqual([]);
  });

  it("rejects an oversize upload before decoding any file", async () => {
    process.env.BOS_MAX_BUNDLE_UPLOAD_BYTES = "10";
    const oversize = "A".repeat(4000);
    const decode = vi.spyOn(Buffer, "from");

    await expect(
      upload([
        { path: "static/js/a.1234abcd5678ef90.js", contentBase64: oversize },
        { path: "static/js/b.1234abcd5678ef91.js", contentBase64: oversize },
      ]),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(decode.mock.calls.filter(([value]) => value === oversize)).toEqual([]);
    expect(puts).toEqual([]);
  });

  it("writes fixed-name entry files only after every hashed asset", async () => {
    await upload([
      { path: "mf-manifest.json", contentBase64: encode("{}") },
      ...Array.from({ length: 8 }, (_, index) => ({
        path: `static/js/chunk-${index}.1234abcd5678ef9${index}.js`,
        contentBase64: encode(`chunk ${index}`),
      })),
      { path: "remoteEntry.js", contentBase64: encode("entry") },
    ]);

    const isEntry = (key: string) => /\/(mf-manifest\.json|remoteEntry\.js)$/.test(key);
    const lastAsset = puts.map(isEntry).lastIndexOf(false);
    const firstEntry = puts.map(isEntry).indexOf(true);
    expect(puts).toHaveLength(10);
    expect(lastAsset).toBeLessThan(firstEntry);
  });

  it("writes unhashed numeric chunks before the manifest and entries", async () => {
    await upload([
      { path: "mf-manifest.json", contentBase64: encode("{}") },
      { path: "remoteEntry.js", contentBase64: encode("entry") },
      ...["64", "199", "301", "412", "518"].map((id) => ({
        path: `${id}.js`,
        contentBase64: encode(`chunk ${id}`),
      })),
    ]);

    const isEntry = (key: string) => /\/(mf-manifest\.json|remoteEntry\.js)$/.test(key);
    expect(puts).toHaveLength(7);
    expect(puts.map(isEntry).lastIndexOf(false)).toBeLessThan(puts.map(isEntry).indexOf(true));
  });

  it("writes no manifest when an unhashed numeric chunk fails to store", async () => {
    failKey = "199.js";

    await expect(
      upload([
        { path: "mf-manifest.json", contentBase64: encode("{}") },
        { path: "remoteEntry.js", contentBase64: encode("entry") },
        { path: "199.js", contentBase64: encode("chunk") },
      ]),
    ).rejects.toMatchObject({ code: "CONNECTION_ERROR" });

    expect(puts.some((key) => /\/(mf-manifest\.json|remoteEntry\.js)$/.test(key))).toBe(false);
  });

  it("writes no entry file when a hashed asset fails to store", async () => {
    failKey = "static/js/broken.1234abcd5678ef90.js";

    await expect(
      upload([
        { path: "remoteEntry.js", contentBase64: encode("entry") },
        { path: "mf-manifest.json", contentBase64: encode("{}") },
        { path: "static/js/broken.1234abcd5678ef90.js", contentBase64: encode("broken") },
      ]),
    ).rejects.toMatchObject({ code: "CONNECTION_ERROR" });

    expect(puts.some((key) => /\/(mf-manifest\.json|remoteEntry\.js)$/.test(key))).toBe(false);
  });
});
