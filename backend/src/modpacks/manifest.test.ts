import { describe, it, expect } from "vitest";
import { parseModpackManifest, parseModpackManifestText } from "./manifest.js";
import { ApiError } from "../utils/api.js";

const valid = {
  name: "My Survival Pack",
  version: "1.0.0",
  minecraftVersion: "1.21.4",
  loader: "fabric",
  loaderVersion: "0.16.14",
  mods: [
    {
      id: "fabric-api",
      name: "Fabric API",
      version: "0.118.0+1.21.4",
      filename: "fabric-api-0.118.0+1.21.4.jar",
      downloadUrl: "https://example.com/fabric-api.jar",
      sha256: "a".repeat(64),
      required: true,
    },
    {
      id: "sodium",
      name: "Sodium",
      version: "0.6.0",
      filename: "sodium-0.6.0.jar",
      required: false,
    },
  ],
};

describe("parseModpackManifest", () => {
  it("accepts a well-formed manifest", () => {
    const parsed = parseModpackManifest(valid);
    expect(parsed.name).toBe("My Survival Pack");
    expect(parsed.mods).toHaveLength(2);
    expect(parsed.mods[0]!.required).toBe(true);
    expect(parsed.mods[1]!.required).toBe(false);
  });

  it("defaults required to true", () => {
    const parsed = parseModpackManifest({ ...valid, mods: [{ id: "x", name: "X", version: "1", filename: "x.jar" }] });
    expect(parsed.mods[0]!.required).toBe(true);
  });

  it("rejects a bad minecraftVersion", () => {
    expect(() => parseModpackManifest({ ...valid, minecraftVersion: "latest" })).toThrow(ApiError);
  });

  it("rejects an unknown loader", () => {
    expect(() => parseModpackManifest({ ...valid, loader: "forge" })).toThrow(ApiError);
  });

  it("rejects filenames that can escape the mods dir", () => {
    expect(() => parseModpackManifest({ ...valid, mods: [{ id: "x", name: "X", version: "1", filename: "../../evil.jar" }] })).toThrow(ApiError);
  });

  it("rejects a malformed sha256", () => {
    expect(() => parseModpackManifest({ ...valid, mods: [{ id: "x", name: "X", version: "1", filename: "x.jar", sha256: "zz" }] })).toThrow(ApiError);
  });

  it("rejects duplicate mod ids", () => {
    const dup = {
      ...valid,
      mods: [
        { id: "x", name: "One", version: "1", filename: "one.jar" },
        { id: "x", name: "Two", version: "2", filename: "two.jar" },
      ],
    };
    expect(() => parseModpackManifest(dup)).toThrow(/Duplicate mod id/);
  });
});

describe("parseModpackManifestText", () => {
  it("parses JSON text", () => {
    expect(parseModpackManifestText(JSON.stringify(valid)).name).toBe("My Survival Pack");
  });

  it("rejects non-JSON text", () => {
    expect(() => parseModpackManifestText("not json [")).toThrow(/not valid JSON/);
  });
});