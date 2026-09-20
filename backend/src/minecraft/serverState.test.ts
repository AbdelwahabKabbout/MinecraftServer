import { describe, it, expect } from "vitest";
import { transitionAllowed, assertTransition, isServerStatus } from "./serverState.js";

describe("server state machine transitions", () => {
  it("accepts expected transitions", () => {
    expect(transitionAllowed("OFFLINE", "STARTING")).toBe(true);
    expect(transitionAllowed("STARTING", "ONLINE")).toBe(true);
    expect(transitionAllowed("STARTING", "STOPPING")).toBe(true);
    expect(transitionAllowed("STARTING", "CRASHED")).toBe(true);
    expect(transitionAllowed("ONLINE", "STOPPING")).toBe(true);
    expect(transitionAllowed("ONLINE", "CRASHED")).toBe(true);
    expect(transitionAllowed("STOPPING", "OFFLINE")).toBe(true);
    expect(transitionAllowed("CRASHED", "STARTING")).toBe(true);
    expect(transitionAllowed("UNKNOWN", "STARTING")).toBe(true);
    expect(transitionAllowed("UNKNOWN", "OFFLINE")).toBe(true);
  });

  it("rejects invalid transitions", () => {
    expect(transitionAllowed("OFFLINE", "ONLINE")).toBe(false);
    expect(transitionAllowed("OFFLINE", "CRASHED")).toBe(false);
    expect(transitionAllowed("STARTING", "STARTING")).toBe(false);
    expect(transitionAllowed("ONLINE", "STARTING")).toBe(false);
    expect(transitionAllowed("CRASHED", "ONLINE")).toBe(false);
    expect(transitionAllowed("ONLINE", "OFFLINE")).toBe(false);
  });

  it("assertTransition throws on invalid moves", () => {
    expect(() => assertTransition("ONLINE", "OFFLINE")).toThrow(/transition/);
    expect(() => assertTransition("OFFLINE", "ONLINE")).toThrow(/transition/);
  });

  it("isServerStatus validates values", () => {
    expect(isServerStatus("ONLINE")).toBe(true);
    expect(isServerStatus("OFFLINE")).toBe(true);
    expect(isServerStatus("NOT_A_STATUS")).toBe(false);
  });
});