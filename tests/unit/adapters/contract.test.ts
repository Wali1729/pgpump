import { describe, expect, test } from "bun:test";
import { bunFastifyAdapter, buildBunFastifyPlan } from "@pgpump/adapter-bun-fastify";
import { buildNodeExpressPlan, nodeExpressAdapter } from "@pgpump/adapter-node-express";
import {
  buildPythonFastApiPlan,
  pythonFastApiAdapter,
} from "@pgpump/adapter-python-fastapi";
import type { TargetAdapter } from "@pgpump/core";
import { sampleIr } from "../../fixtures/sample-ir";

function runAdapterContract(adapter: TargetAdapter) {
  test(`${adapter.id} has stable metadata`, () => {
    expect(adapter.id).toBeTruthy();
    expect(adapter.displayName).toBeTruthy();
  });

  test(`${adapter.id} returns non-empty render plan`, () => {
    const plan = adapter.buildRenderPlan({
      ir: sampleIr,
      options: { outputDir: "./out", docker: true, tests: true },
    });
    expect(plan.files.length).toBeGreaterThan(5);
    expect(plan.files.every((f) => f.path && f.contents.length >= 0)).toBe(true);
  });

  test(`${adapter.id} is deterministic`, () => {
    const opts = { ir: sampleIr, options: { outputDir: "./out", docker: false, tests: false } };
    const a = adapter.buildRenderPlan(opts);
    const b = adapter.buildRenderPlan(opts);
    expect(a.files.map((f) => f.path)).toEqual(b.files.map((f) => f.path));
  });
}

describe("adapter contract", () => {
  runAdapterContract(bunFastifyAdapter);
  runAdapterContract(pythonFastApiAdapter);
  runAdapterContract(nodeExpressAdapter);
});

describe("adapter file expectations", () => {
  test("bun-fastify includes swagger app and health test", () => {
    const plan = buildBunFastifyPlan({
      ir: sampleIr,
      options: { outputDir: "./out", docker: true, tests: true },
    });
    const paths = plan.files.map((f) => f.path);
    expect(paths).toContain("src/app.ts");
    expect(paths).toContain("src/server.ts");
    expect(paths).toContain("tests/health.test.ts");
    expect(paths.some((p) => p.includes("repositories/authors"))).toBe(true);
  });

  test("python-fastapi includes main and routers", () => {
    const plan = buildPythonFastApiPlan({
      ir: sampleIr,
      options: { outputDir: "./out", docker: false, tests: true },
    });
    expect(plan.files.map((f) => f.path)).toContain("main.py");
    expect(plan.files.some((f) => f.path.startsWith("app/routers/"))).toBe(true);
  });

  test("node-express includes app and async handler", () => {
    const plan = buildNodeExpressPlan({
      ir: sampleIr,
      options: { outputDir: "./out", docker: false, tests: true },
    });
    expect(plan.files.map((f) => f.path)).toContain("src/app.ts");
    expect(plan.files.map((f) => f.path)).toContain("src/middleware/asyncHandler.ts");
  });
});
