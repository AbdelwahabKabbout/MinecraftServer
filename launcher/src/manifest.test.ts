import { describe, it, expect } from "vitest";
import { parseManifest, parseManifestText } from "./manifest.js";

const validManifest = {
  name: "Vanilla-ish",
  version: "1.0.0",
  minecraftVersion: "1.21.4",
  loader: "fabric",
  loaderVersion: "0.16.14",
  mods: [
    { id: "fabric-api", name: "Fabric API", version: "0.118.0+1.21.4", filename: "fabric-api-0.118.0+1.21.4.jar", sha256: "a".repeat(64), required: true },
    { id: "sodium", name: "Sodium", version: "0.6.0", filename: "sodium-0.6.0.jar", required: false },
  ],
};

describe("parseManifest", () => {
  it("accepts a valid manifest and normalizes required to true", () => {
    const result = parseManifest({
      ...validManifest,
      mods: [{ id: "fabric-api", name: "Fabric API", version: "1.0.0", filename: "fabric-api.jar" }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.mods[0]?.required).toBe(true);
      expect(result.manifest.loader).toBe("fabric");
    }
  });

  it("rejects a non-object root", () => {
    const result = parseManifest("not an object");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]?.path).toBe("$");
  });

  it("rejects bad versions, ids, filenames, and sha256", () => {
    const result = parseManifest({
      ...validManifest,
      minecraftVersion: "1.21.4-pre1",
      mods: [
        { ...validManifest.mods[0], id: "UPPER", filename: "../evil.jar", sha256: "xyz", downloadUrl: "ftp://x/y.jar" },
        { ...validManifest.mods[0], id: "fabric-api" },
      ],
    });
    expect(result.ok).toBe(false);
    const messages = !result.ok ? result.issues.map((i) => i.message).join(" ") : "";
    expect(messages).toMatch(/Minecraft version/);
    expect(messages).toMatch(/Lowercase/);
    expect(messages).toMatch(/filename/);
    expect(messages).toMatch(/64-char lowercase hex/);
    expect(messages).toMatch(/Must use http/);
  });

  it("rejects duplicate mod ids", () => {
    const result = parseManifest({ ...validManifest, mods: [validManifest.mods[0], validManifest.mods[0]] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((i) => i.message.includes("Duplicate mod id"))).toBe(true);
  });

  it("rejects unsupported loaders", () => {
    const result = parseManifest({ ...validManifest, loader: "forge" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((i) => i.path === "loader")).toBe(true);
  });

  it("rejects oversized mod lists", () => {
    const mods = Array.from({ length: 501 }, (_, index) => ({ id: `mod-${index}`, name: "M", version: "1.0.0", filename: `mod-${index}.jar` }));
    const result = parseManifest({ ...validManifest, mods });
    expect(result.ok).toBe(false);
  });
});

describe("parseManifestText", () => {
  it("parses JSON text", () => {
    const result = parseManifestText(JSON.stringify(validManifest));
    expect(result.ok).toBe(true);
  });

  it("reports broken JSON with location in the message", () => {
    const result = parseManifestText("{ nope");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]?.message).toMatch(/Invalid JSON/);
  });
});