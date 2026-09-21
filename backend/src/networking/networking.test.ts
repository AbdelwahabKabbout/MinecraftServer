import { describe, it, expect } from "vitest";
import { collectLocalIPv4Addresses, LocalNetworkProvider } from "./localNetworkProvider.js";
import { NetworkProviderRegistry, type NetworkProvider } from "./networkProvider.js";

describe("collectLocalIPv4Addresses", () => {
  it("returns private addresses before public and loopback, deduplicated", () => {
    const interfaces = {
      en0: [
        { address: "192.168.1.5", family: "IPv4" as const, internal: false },
        { address: "127.0.0.1", family: "IPv4" as const, internal: true },
      ],
      wlan0: [{ address: "10.0.0.2", family: "IPv4" as const, internal: false }],
      eth0: [{ address: "192.168.1.5", family: "IPv4" as const, internal: false }],
    };
    expect(collectLocalIPv4Addresses(interfaces)).toEqual(["192.168.1.5", "10.0.0.2", "127.0.0.1"]);
  });

  it("puts public addresses after private ones", () => {
    const interfaces = {
      tun0: [
        { address: "203.0.113.7", family: "IPv4" as const, internal: false },
        { address: "0.0.0.0", family: "IPv4" as const, internal: true },
      ],
      lan0: [{ address: "172.20.5.5", family: "IPv4" as const, internal: false }],
    };
    const hosts = collectLocalIPv4Addresses(interfaces);
    expect(hosts[0]).toBe("172.20.5.5");
    expect(hosts).toContain("203.0.113.7");
  });

  it("falls back to loopback when there is no real interface", () => {
    const interfaces = { lo: [{ address: "127.0.0.1", family: "IPv4" as const, internal: true }] };
    expect(collectLocalIPv4Addresses(interfaces)).toEqual(["127.0.0.1"]);
  });

  it("skips IPv6 entries", () => {
    const interfaces = {
      lan0: [
        { address: "fe80::1", family: "IPv6" as const, internal: false },
        { address: "192.168.0.42", family: "IPv4" as const, internal: false },
      ],
    };
    expect(collectLocalIPv4Addresses(interfaces)).toEqual(["192.168.0.42"]);
  });

  it("returns empty when there are no interfaces", () => {
    expect(collectLocalIPv4Addresses({})).toEqual([]);
  });
});

describe("LocalNetworkProvider", () => {
  it("resolves usable addresses including the given port", async () => {
    const provider = new LocalNetworkProvider(() => ({
      lan0: [{ address: "192.168.1.5", family: "IPv4" as const, internal: false }],
    }));
    const result = await provider.resolve(25565);
    expect(result.kind).toBe("local");
    expect(result.usable).toBe(true);
    expect(result.addresses).toEqual([{ host: "192.168.1.5", port: 25565 }]);
  });

  it("reports unusable when there are no interfaces", async () => {
    const provider = new LocalNetworkProvider(() => ({}));
    const result = await provider.resolve(25565);
    expect(result.usable).toBe(false);
    expect(result.addresses).toEqual([]);
    expect(result.note).toMatch(/no usable network interface/i);
  });
});

describe("NetworkProviderRegistry", () => {
  it("registers, looks up and lists providers by kind", () => {
    const registry = new NetworkProviderRegistry();
    const fake: NetworkProvider = {
      kind: "port-forward",
      label: "Port forwarding",
      async resolve() {
        return { kind: "port-forward", label: "Port forwarding", usable: true, note: "", addresses: [] };
      },
    };
    expect(registry.get("port-forward")).toBeUndefined();
    registry.register(fake);
    expect(registry.get("port-forward")).toBe(fake);
    expect(registry.list()).toEqual([{ kind: "port-forward", label: "Port forwarding" }]);
  });
});