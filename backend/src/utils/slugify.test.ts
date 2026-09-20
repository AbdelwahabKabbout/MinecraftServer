import { describe, it, expect } from "vitest";
import { slugify, uniqueSlug } from "./slugify.js";

describe("slugify", () => {
  it("lowercases and slugifies basic names", () => {
    expect(slugify("My Server")).toBe("my-server");
    expect(slugify("Survival World")).toBe("survival-world");
  });

  it("replaces ampersand with and", () => {
    expect(slugify("Tom & Jerry")).toBe("tom-and-jerry");
  });

  it("collapses separators and trims edges", () => {
    expect(slugify("  Double--Space  ")).toBe("double-space");
  });

  it("strips non-ascii characters", () => {
    expect(slugify("Café Spezial")).toBe("caf-spezial");
  });

  it("caps length at 64 chars", () => {
    expect(slugify("a".repeat(200)).length).toBeLessThanOrEqual(64);
  });
});

describe("uniqueSlug", () => {
  it("returns the base slug when free", () => {
    expect(uniqueSlug("my-server", new Set(["other"]))).toBe("my-server");
  });

  it("appends a numeric suffix on collision", () => {
    expect(uniqueSlug("my-server", new Set(["my-server", "my-server-2"]))).toBe("my-server-3");
  });
});