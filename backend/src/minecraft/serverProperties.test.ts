import { describe, it, expect } from "vitest";
import { parseProperties, parseSingle, setProperty, parseBoolean, parsePort } from "./serverProperties.js";

const BASE = [
  "#Minecraft server properties",
  "#Fri Feb 01 12:00:00 UTC 2026",
  "server-port=25565",
  "motd=A lovely server",
  "white-list=false",
  "",
].join("\n");

describe("serverProperties", () => {
  it("parses key/value pairs", () => {
    const map = parseProperties(BASE);
    expect(map.get("server-port")).toBe("25565");
    expect(map.get("motd")).toBe("A lovely server");
    expect(map.get("white-list")).toBe("false");
  });

  it("ignores comment and blank lines", () => {
    expect(parseSingle(BASE, "unknown")).toBeUndefined();
    expect(parseSingle("#comment", "server-port")).toBeUndefined();
  });

  it("reads a single value", () => {
    expect(parseSingle(BASE, "server-port")).toBe("25565");
  });

  it("adds a missing key preserving existing lines", () => {
    const out = setProperty(BASE, "max-players", "20");
    expect(parseSingle(out, "max-players")).toBe("20");
    expect(out).toContain("#Minecraft server properties");
    expect(out).toContain("server-port=25565");
    expect((out.match(/server-port=25565/g) ?? []).length).toBe(1);
  });

  it("updates an existing key in place without duplicating", () => {
    const out = setProperty(BASE, "server-port", "25570");
    expect(parseSingle(out, "server-port")).toBe("25570");
    expect((out.match(/server-port/g) ?? []).length).toBe(1);
  });

  it("supports CRLF input", () => {
    const crlf = BASE.replace(/\n/g, "\r\n");
    const out = setProperty(crlf, "motd", "hello");
    expect(parseSingle(out, "motd")).toBe("hello");
  });

  it("round-trips a full document", () => {
    const out = setProperty(setProperty(BASE, "white-list", "true"), "view-distance", "12");
    const map = parseProperties(out);
    expect(map.get("white-list")).toBe("true");
    expect(map.get("view-distance")).toBe("12");
    expect(map.get("server-port")).toBe("25565");
  });

  it("parses booleans and ports defensively", () => {
    expect(parseBoolean("true")).toBe(true);
    expect(parseBoolean("false")).toBe(false);
    expect(parseBoolean("yes")).toBe(false);
    expect(parseBoolean(undefined)).toBeUndefined();
    expect(parsePort("25565")).toBe(25565);
    expect(parsePort("0")).toBeUndefined();
    expect(parsePort("99999")).toBeUndefined();
    expect(parsePort("abc")).toBeUndefined();
    expect(parsePort(undefined)).toBeUndefined();
  });
});