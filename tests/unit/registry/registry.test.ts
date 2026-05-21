import { describe, expect, test } from "bun:test";
import { bunFastifyAdapter } from "@pgpump/adapter-bun-fastify";
import { createDefaultRegistry } from "@pgpump/core";
import { sampleIr } from "../../fixtures/sample-ir";

describe("AdapterRegistry", () => {
  test("registers and retrieves adapter", () => {
    const registry = createDefaultRegistry();
    registry.register(bunFastifyAdapter);
    expect(registry.get("bun-fastify").id).toBe("bun-fastify");
    expect(registry.list()).toContain("bun-fastify");
  });

  test("throws for unknown adapter", () => {
    const registry = createDefaultRegistry();
    expect(() => registry.get("unknown")).toThrow(/Unknown adapter/);
  });

  test("buildRenderPlan delegates to adapter", async () => {
    const registry = createDefaultRegistry();
    registry.register(bunFastifyAdapter);
    const plan = await registry.buildRenderPlan("bun-fastify", {
      ir: sampleIr,
      options: { outputDir: "./out", docker: false, tests: false },
    });
    expect(plan.files.length).toBeGreaterThan(0);
  });
});
