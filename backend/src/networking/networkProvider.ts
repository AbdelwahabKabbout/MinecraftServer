export type NetworkProviderKind = "local" | "port-forward" | "tunnel";

export interface NetworkAddress {
  host: string;
  port: number;
}

export interface ResolvedNetworkConnection {
  kind: NetworkProviderKind;
  label: string;
  usable: boolean;
  note: string;
  addresses: NetworkAddress[];
}

export interface NetworkProvider {
  readonly kind: NetworkProviderKind;
  readonly label: string;
  resolve(port: number): Promise<ResolvedNetworkConnection>;
}

export class NetworkProviderRegistry {
  private readonly providers = new Map<NetworkProviderKind, NetworkProvider>();

  register(provider: NetworkProvider): void {
    this.providers.set(provider.kind, provider);
  }

  get(kind: NetworkProviderKind): NetworkProvider | undefined {
    return this.providers.get(kind);
  }

  list(): { kind: NetworkProviderKind; label: string }[] {
    return [...this.providers.values()].map((provider) => ({ kind: provider.kind, label: provider.label }));
  }
}

export const networkProviderRegistry = new NetworkProviderRegistry();