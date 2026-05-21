import { describe, expect, test } from "bun:test";
import {
  AdapterRegistry,
  type AdapterInput,
  type RenderPlan,
  type TargetAdapter,
} from "@pgpump/core";
import { sampleIr } from "../../fixtures/sample-ir";

function brokenAdapter(): TargetAdapter {
  return {
    id: "broken",
    displayName: "Broken (test-only)",
    description: "Emits two identical fastify routes",
    buildRenderPlan: (_input: AdapterInput): RenderPlan => ({
      files: [
        {
          path: "src/routes/dup.ts",
          contents: `app.get("/dup", () => {});\napp.get("/dup", () => {});`,
        },
      ],
      warnings: [],
    }),
  };
}

describe("AdapterRegistry route guard", () => {
  test("rejects render plans with duplicate routes", async () => {
    const registry = new AdapterRegistry();
    registry.register(brokenAdapter());
    await expect(
      registry.buildRenderPlan("broken", {
        ir: sampleIr,
        options: { outputDir: "./out", docker: false, tests: false },
      }),
    ).rejects.toThrow(/Duplicate route/);
  });
});
