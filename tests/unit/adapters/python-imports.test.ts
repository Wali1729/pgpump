import { describe, expect, test } from "bun:test";
import { buildPythonFastApiPlan } from "@pgpump/adapter-python-fastapi";
import { multiFkIr } from "../../fixtures/multi-fk-ir";

interface RenderFile {
  path: string;
  contents: string;
}

function fileMap(files: RenderFile[]): Map<string, string> {
  return new Map(files.map((f) => [f.path, f.contents]));
}

describe("python-fastapi imports must resolve to emitted files", () => {
  test("every router import in app/main.py corresponds to an emitted router module", () => {
    const plan = buildPythonFastApiPlan({
      ir: multiFkIr,
      options: { outputDir: "./out", docker: false, tests: false },
    });
    const files = fileMap(plan.files);
    const main = files.get("app/main.py");
    expect(main).toBeTruthy();

    const importRe = /^from app\.api\.routers import (\w+)/gm;
    const missing: string[] = [];
    for (const match of (main as string).matchAll(importRe)) {
      const mod = match[1];
      if (!files.has(`app/api/routers/${mod}.py`)) {
        missing.push(mod);
      }
    }
    expect(missing).toEqual([]);
  });

  test("every app.include_router(...) refers to an imported router alias", () => {
    const plan = buildPythonFastApiPlan({
      ir: multiFkIr,
      options: { outputDir: "./out", docker: false, tests: false },
    });
    const main = fileMap(plan.files).get("app/main.py") as string;
    const aliases = new Set<string>();
    for (const match of main.matchAll(/^from app\.api\.routers import (\w+) as (\w+)$/gm)) {
      aliases.add(match[2]);
    }
    const include = main.matchAll(/app\.include_router\((\w+)\.router\)/g);
    const orphans: string[] = [];
    for (const m of include) {
      if (!aliases.has(m[1])) orphans.push(m[1]);
    }
    expect(orphans).toEqual([]);
  });

  test("app/api/routers/__init__.py is emitted exactly once", () => {
    const plan = buildPythonFastApiPlan({
      ir: multiFkIr,
      options: { outputDir: "./out", docker: false, tests: false },
    });
    const initCount = plan.files.filter(
      (f) => f.path === "app/api/routers/__init__.py",
    ).length;
    expect(initCount).toBe(1);
  });
});
