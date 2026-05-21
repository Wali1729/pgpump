import { describe, expect, test } from "bun:test";
import { buildPythonFastApiPlan } from "@pgpump/adapter-python-fastapi";
import { multiFkIr } from "../../fixtures/multi-fk-ir";

// Detects an empty class body — a Python class definition that is
// immediately followed by another top-level statement (or EOF) with
// no indented lines below it. This is invalid Python.
function hasEmptyClassBody(source: string): { className: string }[] {
  const findings: { className: string }[] = [];
  const re = /^class\s+(\w+)\s*\([^)]*\)\s*:\s*\n([\s\S]*?)(?=^\S|\Z)/gm;
  for (const m of source.matchAll(re)) {
    const body = m[2];
    const hasIndented = body
      .split("\n")
      .some((line) => /^\s+\S/.test(line));
    if (!hasIndented) findings.push({ className: m[1] });
  }
  return findings;
}

describe("python-fastapi router files compile as valid Python", () => {
  test("classes with no fields emit `pass`", () => {
    const plan = buildPythonFastApiPlan({
      ir: multiFkIr,
      options: { outputDir: "./out", docker: false, tests: false },
    });
    const offenders: { file: string; className: string }[] = [];
    for (const f of plan.files) {
      if (!f.path.endsWith(".py")) continue;
      for (const empty of hasEmptyClassBody(f.contents)) {
        offenders.push({ file: f.path, className: empty.className });
      }
    }
    expect(offenders).toEqual([]);
  });

  test("alembic-style PK-only table still generates a valid router", () => {
    const plan = buildPythonFastApiPlan({
      ir: multiFkIr,
      options: { outputDir: "./out", docker: false, tests: false },
    });
    const router = plan.files.find(
      (f) => f.path === "app/routers/alembic_version.py",
    );
    expect(router).toBeTruthy();
    expect(hasEmptyClassBody(router!.contents)).toEqual([]);
  });
});
