import { networkProviderRegistry } from "./networkProvider.js";
import { createDefaultNetworkProvider } from "./localNetworkProvider.js";

networkProviderRegistry.register(createDefaultNetworkProvider());

export * from "./networkProvider.js";
export * from "./localNetworkProvider.js";