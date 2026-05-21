import { describe, expect, test } from "bun:test";
import { bunFastifyAdapter } from "@pgpump/adapter-bun-fastify";
import { nodeExpressAdapter } from "@pgpump/adapter-node-express";
import { pythonFastApiAdapter } from "@pgpump/adapter-python-fastapi";
import type { RenderPlan, TargetAdapter } from "@pgpump/core";
import { multiFkIr } from "../../fixtures/multi-fk-ir";

interface BrokenImport {
  fromFile: string;
  importedPath: string;
}

// Resolve a relative TS/JS import like "./routes/foo" or "./routes/foo.js"
// against the importing file's directory, then check whether the resulting
// `.ts` / `.py` file is present in the plan.
function resolveJsImport(fromFile: string, spec: string): string {
  const dir = fromFile.includes("/")
    ? fromFile.slice(0, fromFile.lastIndexOf("/"))
    : "";
  const parts = `${dir}/${spec.replace(/\.js$/, "")}`.split("/");
  const stack: string[] = [];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  return stack.join("/");
}

function findBrokenJsImports(plan: RenderPlan): BrokenImport[] {
  const paths = new Set(plan.files.map((f) => f.path));
  const broken: BrokenImport[] = [];
  const importRe = /(?:from|import)\s+["']((?:\.|\.\.)\/[^"']+)["']/g;
  for (const file of plan.files) {
    if (!file.path.endsWith(".ts") && !file.path.endsWith(".js")) continue;
    for (const m of file.contents.matchAll(importRe)) {
      const spec = m[1];
      if (spec.includes("node_modules")) continue;
      const resolved = resolveJsImport(file.path, spec);
      const candidates = [
        `${resolved}.ts`,
        `${resolved}.tsx`,
        `${resolved}/index.ts`,
        `${resolved}.js`,
      ];
      if (!candidates.some((c) => paths.has(c))) {
        broken.push({ fromFile: file.path, importedPath: spec });
      }
    }
  }
  return broken;
}

function findBrokenPythonImports(plan: RenderPlan): BrokenImport[] {
  const paths = new Set(plan.files.map((f) => f.path));
  const broken: BrokenImport[] = [];
  // Only check intra-project imports — anything starting with `app.` or `main`.
  const importRe = /^from\s+((?:app|main)(?:\.[\w]+)*)\s+import\s+(\w+)/gm;
  for (const file of plan.files) {
    if (!file.path.endsWith(".py")) continue;
    for (const m of file.contents.matchAll(importRe)) {
      const pkg = m[1];
      const name = m[2];
      // `pkg` like `app.routers`, candidates: <pkg>/<name>.py or <pkg>.py with attribute
      const pkgPath = pkg.replace(/\./g, "/");
      const candidates = [
        `${pkgPath}/${name}.py`,
        `${pkgPath}.py`, // `from app.database import get_pool` → app/database.py
      ];
      if (!candidates.some((c) => paths.has(c))) {
        broken.push({ fromFile: file.path, importedPath: `${pkg}.${name}` });
      }
    }
  }
  return broken;
}

const resolvers: Record<string, (plan: RenderPlan) => BrokenImport[]> = {
  "bun-fastify": findBrokenJsImports,
  "node-express": findBrokenJsImports,
  "python-fastapi": findBrokenPythonImports,
};

function runAdapter(adapter: TargetAdapter) {
  describe(`cross-file imports — ${adapter.id}`, () => {
    test("every relative/intra-project import resolves to an emitted file", async () => {
      const plan = await Promise.resolve(adapter.buildRenderPlan({
        ir: multiFkIr,
        options: { outputDir: "./out", docker: true, tests: true },
      }));
      const broken = resolvers[adapter.id](plan);
      if (broken.length > 0) {
        const detail = broken
          .map((b) => `  ${b.fromFile}  →  ${b.importedPath}`)
          .join("\n");
        throw new Error(
          `${adapter.id}: ${broken.length} broken import(s):\n${detail}`,
        );
      }
      expect(broken).toEqual([]);
    });

    test("no render file is emitted twice with the same path", async () => {
      const plan = await Promise.resolve(adapter.buildRenderPlan({
        ir: multiFkIr,
        options: { outputDir: "./out", docker: false, tests: false },
      }));
      const seen = new Map<string, number>();
      for (const f of plan.files) {
        seen.set(f.path, (seen.get(f.path) ?? 0) + 1);
      }
      const dupes = [...seen.entries()].filter(([, n]) => n > 1);
      expect(dupes).toEqual([]);
    });
  });
}

runAdapter(bunFastifyAdapter);
runAdapter(nodeExpressAdapter);
runAdapter(pythonFastApiAdapter);
