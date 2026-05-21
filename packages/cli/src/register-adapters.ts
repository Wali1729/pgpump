import type { AdapterRegistry } from "@pgpump/core";
import { bunFastifyAdapter } from "@pgpump/adapter-bun-fastify";
import { nodeExpressAdapter } from "@pgpump/adapter-node-express";
import { pythonFastApiAdapter } from "@pgpump/adapter-python-fastapi";

export function registerBuiltins(registry: AdapterRegistry): void {
  registry.register(bunFastifyAdapter);
  registry.register(pythonFastApiAdapter);
  registry.register(nodeExpressAdapter);
}
