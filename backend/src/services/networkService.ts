import { serverRepository } from "../repositories/serverRepository.js";
import {
  networkProviderRegistry,
  type NetworkProviderKind,
  type ResolvedNetworkConnection,
} from "../networking/networkProvider.js";
import { ApiError } from "../utils/api.js";

export interface ServerNetworkReport extends ResolvedNetworkConnection {
  serverId: string;
  serverPort: number;
  provider: NetworkProviderKind;
}

export class NetworkService {
  async providers(): Promise<{ kind: NetworkProviderKind; label: string }[]> {
    return networkProviderRegistry.list();
  }

  async networkForServer(serverId: string): Promise<ServerNetworkReport> {
    const server = serverRepository.getOrThrow(serverId);
    const provider = networkProviderRegistry.get(server.networkProvider as NetworkProviderKind);
    if (!provider) {
      throw new ApiError("NETWORK_PROVIDER_NOT_FOUND", `Network provider '${server.networkProvider}' is not registered.`, 422);
    }
    const resolved = await provider.resolve(server.port);
    return {
      serverId: server.id,
      serverPort: server.port,
      provider: provider.kind,
      ...resolved,
    };
  }
}

export const networkService = new NetworkService();