import { describe, it, expect } from "vitest";
import {
  parseCpuSecondsFromStat,
  parseVmRssKb,
  computeCpuPercent,
  bytesToMb,
} from "./processMetrics.js";

describe("parseCpuSecondsFromStat", () => {
  it("sums utime + stime and converts ticks to seconds", () => {
    const stat = "1234 (java) S 1 1234 1234 0 -1 4194560 500 0 0 0 321 178 0 0 20 0 ...";
    expect(parseCpuSecondsFromStat(stat, 100)).toBeCloseTo(4.99, 5);
  });

  it("handles a comma containing spaces and parentheses", () => {
    const stat = "5 (Server thread) S 1 5 5 0 -1 4194560 0 0 0 0 0 250 0 0 20 0 ...";
    expect(parseCpuSecondsFromStat(stat, 100)).toBeCloseTo(2.5, 5);
  });

  it("returns null for malformed input", () => {
    expect(parseCpuSecondsFromStat("garbage")).toBeNull();
  });
});

describe("parseVmRssKb", () => {
  it("extracts VmRSS kilobytes", () => {
    const status = "Name:\tjava\nVmRSS:\t  402816 kB\nVmSize:\t4194304 kB\n";
    expect(parseVmRssKb(status)).toBe(402816);
  });

  it("returns null when VmRSS is absent", () => {
    expect(parseVmRssKb("Name:\tjava\n")).toBeNull();
  });
});

describe("computeCpuPercent", () => {
  it("computes percent from a delta across a second", () => {
    expect(computeCpuPercent(10, 10.5, 0, 1)).toBe(50);
  });

  it("clamps to 100", () => {
    expect(computeCpuPercent(10, 12, 0, 1)).toBe(100);
  });

  it("returns 0 for a zero or negative interval", () => {
    expect(computeCpuPercent(10, 10.5, 0, 0)).toBe(0);
    expect(computeCpuPercent(10, 10.5, 0, -1)).toBe(0);
    expect(computeCpuPercent(12, 10, 0, 1)).toBe(0);
  });
});

describe("bytesToMb", () => {
  it("rounds bytes to mebibytes", () => {
    expect(bytesToMb(512 * 1024 * 1024)).toBe(512);
    expect(bytesToMb(500)).toBe(0);
  });
});