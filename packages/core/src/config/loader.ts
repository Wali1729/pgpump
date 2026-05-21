import path from "node:path";
import type { TargetAdapter } from "../ir/types";
import type { AdapterRegistry } from "../registry";

export interface PgpumpConfig {
  adapters?: TargetAdapter[];
}

export async function loadConfig(
  configPath: string | undefined,
): Promise<PgpumpConfig> {
  if (!configPath) return {};
  const resolved = path.resolve(configPath);
  const mod = await import(resolved);
  const config: PgpumpConfig = mod.default ?? mod.config ?? mod;
  return config;
}

export function applyConfigToRegistry(
  registry: AdapterRegistry,
  config: PgpumpConfig,
): void {
  for (const adapter of config.adapters ?? []) {
    registry.register(adapter);
  }
}
