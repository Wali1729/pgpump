import { describe, expect, test } from "bun:test";
import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { bunFastifyAdapter } from "@pgpump/adapter-bun-fastify";
import {
  applyConfigToRegistry,
  createDefaultRegistry,
  loadConfig,
} from "@pgpump/core";

describe("config loader", () => {
  test("loadConfig returns empty object when path omitted", async () => {
    expect(await loadConfig(undefined)).toEqual({});
  });

  test("loadConfig imports config module", async () => {
    const configPath = path.join(
      tmpdir(),
      `pgpump-config-${Date.now()}.ts`,
    );
    await writeFile(
      configPath,
      "export default { adapters: [] };\n",
      "utf8",
    );
    try {
      const config = await loadConfig(configPath);
      expect(config.adapters).toEqual([]);
    } finally {
      await unlink(configPath);
    }
  });

  test("applyConfigToRegistry registers adapters from config", () => {
    const registry = createDefaultRegistry();
    applyConfigToRegistry(registry, { adapters: [bunFastifyAdapter] });
    expect(registry.get("bun-fastify").id).toBe("bun-fastify");
  });
});
