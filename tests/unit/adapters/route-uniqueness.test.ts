import { describe, expect, test } from "bun:test";
import { bunFastifyAdapter } from "@pgpump/adapter-bun-fastify";
import { nodeExpressAdapter } from "@pgpump/adapter-node-express";
import { pythonFastApiAdapter } from "@pgpump/adapter-python-fastapi";
import {
  assertNoDuplicateRoutes,
  type RenderPlan,
  type TargetAdapter,
} from "@pgpump/core";
import { multiFkIr } from "../../fixtures/multi-fk-ir";
import { sampleIr } from "../../fixtures/sample-ir";

interface RouteSignature {
  method: string;
  path: string;
  file: string;
}

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"];

function extractFastifyRoutes(plan: RenderPlan): RouteSignature[] {
  const out: RouteSignature[] = [];
  for (const f of plan.files) {
    if (!f.path.endsWith(".ts")) continue;
    for (const method of HTTP_METHODS) {
      const re = new RegExp(`app\\.${method}\\(\\s*["\`]([^"\`]+)["\`]`, "g");
      for (const m of f.contents.matchAll(re)) {
        out.push({ method, path: m[1], file: f.path });
      }
    }
  }
  return out;
}

function extractExpressRoutes(plan: RenderPlan): RouteSignature[] {
  const out: RouteSignature[] = [];
  for (const f of plan.files) {
    if (!f.path.endsWith(".ts")) continue;
    for (const method of HTTP_METHODS) {
      const re = new RegExp(`router\\.${method}\\(\\s*["\`]([^"\`]+)["\`]`, "g");
      for (const m of f.contents.matchAll(re)) {
        out.push({ method, path: `${f.path}::${m[1]}`, file: f.path });
      }
    }
  }
  return out;
}

function extractFastApiRoutes(plan: RenderPlan): RouteSignature[] {
  const out: RouteSignature[] = [];
  for (const f of plan.files) {
    if (!f.path.endsWith(".py")) continue;
    for (const method of HTTP_METHODS) {
      const re = new RegExp(`@router\\.${method}\\(\\s*["']([^"']+)["']`, "g");
      for (const m of f.contents.matchAll(re)) {
        out.push({ method, path: `${f.path}::${m[1]}`, file: f.path });
      }
    }
  }
  return out;
}

const extractors: Record<string, (plan: RenderPlan) => RouteSignature[]> = {
  "bun-fastify": extractFastifyRoutes,
  "node-express": extractExpressRoutes,
  "python-fastapi": extractFastApiRoutes,
};

function assertNoDuplicates(routes: RouteSignature[], label: string): void {
  const seen = new Map<string, RouteSignature>();
  const dupes: { key: string; first: RouteSignature; second: RouteSignature }[] = [];
  for (const r of routes) {
    const key = `${r.method.toUpperCase()} ${r.path}`;
    const prior = seen.get(key);
    if (prior) {
      dupes.push({ key, first: prior, second: r });
    } else {
      seen.set(key, r);
    }
  }
  if (dupes.length > 0) {
    const detail = dupes
      .map((d) => `  - ${d.key} declared in ${d.first.file} and ${d.second.file}`)
      .join("\n");
    throw new Error(`${label}: ${dupes.length} duplicate route(s)\n${detail}`);
  }
}

function runAdapter(adapter: TargetAdapter) {
  describe(`route uniqueness — ${adapter.id}`, () => {
    test("no duplicate routes on sample IR", () => {
      const plan = adapter.buildRenderPlan({
        ir: sampleIr,
        options: { outputDir: "./out", docker: false, tests: false },
      });
      const routes = extractors[adapter.id](plan);
      expect(routes.length).toBeGreaterThan(0);
      assertNoDuplicates(routes, adapter.id);
    });

    test("no duplicate routes when child has multiple FKs to same parent", () => {
      const plan = adapter.buildRenderPlan({
        ir: multiFkIr,
        options: { outputDir: "./out", docker: false, tests: false },
      });
      const routes = extractors[adapter.id](plan);
      expect(routes.length).toBeGreaterThan(0);
      assertNoDuplicates(routes, adapter.id);
    });

    test("passes the core route validator (no false positives on its own output)", () => {
      const plan = adapter.buildRenderPlan({
        ir: multiFkIr,
        options: { outputDir: "./out", docker: true, tests: true },
      });
      expect(() => assertNoDuplicateRoutes(plan)).not.toThrow();
    });
  });
}

runAdapter(bunFastifyAdapter);
runAdapter(nodeExpressAdapter);
runAdapter(pythonFastApiAdapter);
