import os from "node:os";
import type { NetworkProvider, ResolvedNetworkConnection, NetworkAddress } from "./networkProvider.js";

export type InterfaceMap = NodeJS.Dict<os.NetworkInterfaceInfo[]>;

function isPrivateIPv4(host: string): boolean {
  return (
    host.startsWith("192.168.") ||
    host.startsWith("10.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  );
}

/** Collects deduplicated IPv4 addresses from the given interface map. */
export function collectLocalIPv4Addresses(interfaces: InterfaceMap): string[] {
  const seen = new Set<string>();
  const addresses: string[] = [];
  const push = (host: string) => {
    const normalized = host.split(".").map((part) => Number(part)).join(".");
    if (!seen.has(normalized)) {
      seen.add(normalized);
      addresses.push(host);
    }
  };

  const loopback: string[] = [];
  const publicAddresses: string[] = [];
  const privateAddresses: string[] = [];

  for (const entries of Object.values(interfaces)) {
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.family !== "IPv4") continue;
      if (entry.internal) {
        loopback.push(entry.address);
      } else if (isPrivateIPv4(entry.address)) {
        privateAddresses.push(entry.address);
      } else {
        publicAddresses.push(entry.address);
      }
    }
  }

  privateAddresses.forEach(push);
  publicAddresses.forEach(push);
  loopback.forEach(push);
  return addresses;
}

export class LocalNetworkProvider implements NetworkProvider {
  readonly kind = "local" as const;
  readonly label = "Local network";

  constructor(private readonly interfaces: () => InterfaceMap) {}

  async resolve(port: number): Promise<ResolvedNetworkConnection> {
    const hosts = collectLocalIPv4Addresses(this.interfaces());
    const addresses: NetworkAddress[] = hosts.map((host) => ({ host, port }));
    const usable = addresses.length > 0;
    return {
      kind: this.kind,
      label: this.label,
      usable,
      note: usable
        ? `Use the local addresses below on devices inside this network.`
        : "No usable network interface detected; check that the machine has a network connection.",
      addresses,
    };
  }
}

export function createDefaultNetworkProvider(): LocalNetworkProvider {
  return new LocalNetworkProvider(() => os.networkInterfaces());
}