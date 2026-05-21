import { describe, expect, test } from "bun:test";
import { buildPythonFastApiPlan } from "@pgpump/adapter-python-fastapi";
import { sampleIr } from "../../fixtures/sample-ir";

function planFiles() {
  return new Map(
    buildPythonFastApiPlan({
      ir: sampleIr,
      options: { outputDir: "./out", docker: true, tests: true },
    }).files.map((file) => [file.path, file.contents]),
  );
}

describe("python-fastapi modular architecture", () => {
  test("emits separate model, schema, repository, service, and router modules per table", () => {
    const files = planFiles();

    for (const table of sampleIr.tables) {
      expect(files.has(`app/models/${table.name}.py`)).toBe(true);
      expect(files.has(`app/schemas/${table.name}.py`)).toBe(true);
      expect(files.has(`app/repositories/${table.name}.py`)).toBe(true);
      expect(files.has(`app/services/${table.name}.py`)).toBe(true);
      expect(files.has(`app/api/routers/${table.name}.py`)).toBe(true);
    }
  });

  test("routers stay thin and delegate persistence to services", () => {
    const files = planFiles();

    for (const table of sampleIr.tables) {
      const router = files.get(`app/api/routers/${table.name}.py`);
      expect(router).toBeTruthy();
      expect(router).not.toContain("select(");
      expect(router).not.toContain("session.execute");
      expect(router).not.toContain("session.commit");
      expect(router).toContain("Depends(get_session)");
      expect(router).toContain("return await service.");
    }
  });

  test("repositories own async SQLAlchemy query construction", () => {
    const files = planFiles();
    const repository = files.get("app/repositories/authors.py");

    expect(repository).toContain("from sqlalchemy import func, select");
    expect(repository).toContain("AsyncSession");
    expect(repository).toContain("await session.execute");
    expect(repository).toContain("await session.commit");
  });

  test("requirements and environment target SQLAlchemy async Postgres", () => {
    const files = planFiles();

    expect(files.get("requirements.txt")).toContain("sqlalchemy");
    expect(files.get("requirements.txt")).toContain("asyncpg");
    expect(files.get(".env.example")).toContain("postgresql+asyncpg://");
  });
});
