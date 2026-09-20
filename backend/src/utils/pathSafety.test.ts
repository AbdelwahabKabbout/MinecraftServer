import { describe, it, expect } from "vitest";
import path from "node:path";
import { resolveSafePath } from "./pathSafety.js";
import { ApiError } from "./api.js";

const ROOT = path.resolve("C:\\data\\servers\\rootdir");

describe("resolveSafePath", () => {
  it("resolves a plain relative path underneath root", () => {
    expect(resolveSafePath(ROOT, "survival")).toBe(path.join(ROOT, "survival"));
  });

  it("allows nested subdirectories", () => {
    expect(resolveSafePath(ROOT, "a/b/c")).toBe(path.join(ROOT, "a", "b", "c"));
  });

  it("normalizes backslashes and dot segments", () => {
    expect(resolveSafePath(ROOT, "a\\.\\b")).toBe(path.join(ROOT, "a", "b"));
  });

  it("rejects empty paths", () => {
    expect(() => resolveSafePath(ROOT, "")).toThrow(ApiError);
    expect(() => resolveSafePath(ROOT, "   ")).toThrow(ApiError);
  });

  it("rejects absolute paths", () => {
    expect(() => resolveSafePath(ROOT, "C:\\evil")).toThrow(/relative/);
    expect(() => resolveSafePath(ROOT, "C:/evil")).toThrow(/relative/);
  });

  it("rejects traversal", () => {
    expect(() => resolveSafePath(ROOT, "../evil")).toThrow(/escapes/);
    expect(() => resolveSafePath(ROOT, "..\\..\\evil")).toThrow(/escapes/);
    expect(() => resolveSafePath(ROOT, "a/../../evil")).toThrow(/escapes/);
  });

  it("rejects windows drive segments", () => {
    // A drive-qualified path is itself absolute, so it is rejected up front.
    expect(() => resolveSafePath(ROOT, "C:\\x\\..\\evil")).toThrow(ApiError);
  });

  it("rejects null bytes", () => {
    expect(() => resolveSafePath(ROOT, "a\0b")).toThrow(/invalid/);
  });
});