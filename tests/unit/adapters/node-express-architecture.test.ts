import { describe, expect, test } from "bun:test";
import { buildNodeExpressPlan } from "@pgpump/adapter-node-express";
import { sampleIr } from "../../fixtures/sample-ir";

function planFiles() {
  return new Map(
    buildNodeExpressPlan({
      ir: sampleIr,
      options: { outputDir: "./out", docker: true, tests: true },
    }).files.map((file) => [file.path, file.contents]),
  );
}

describe("node-express modular architecture", () => {
  test("emits separate schema, repository, service, and route modules per table", () => {
    const files = planFiles();

    for (const table of sampleIr.tables) {
      expect(files.has(`src/db/schema/${table.name}.ts`)).toBe(true);
      expect(files.has(`src/schemas/${table.name}.ts`)).toBe(true);
      expect(files.has(`src/repositories/${table.name}.ts`)).toBe(true);
      expect(files.has(`src/services/${table.name}.ts`)).toBe(true);
      expect(files.has(`src/routes/${table.name}.ts`)).toBe(true);
    }
  });

  test("routes stay thin and delegate persistence to services", () => {
    const files = planFiles();

    for (const table of sampleIr.tables) {
      const router = files.get(`src/routes/${table.name}.ts`);
      expect(router).toBeTruthy();
      expect(router).not.toContain("pool.query");
      expect(router).not.toContain("db.select");
      expect(router).not.toContain("drizzle");
      expect(router).toContain("await service.");
    }
  });

  test("repositories own Drizzle query construction", () => {
    const files = planFiles();
    const repository = files.get("src/repositories/authors.ts");

    expect(repository).toContain('from "drizzle-orm"');
    expect(repository).toContain("eq(");
    expect(repository).toContain("AuthorsRepository");
  });

  test("package.json targets Drizzle ORM and pg", () => {
    const files = planFiles();
    const pkg = files.get("package.json");

    expect(pkg).toContain("drizzle-orm");
    expect(pkg).toContain("pg");
    expect(pkg).toContain("express");
    expect(pkg).toContain("zod");
  });

  test("nested relation routes are present on parent routers", () => {
    const files = planFiles();
    const authorsRouter = files.get("src/routes/authors.ts");

    expect(authorsRouter).toContain("/:parentId/books");
    expect(authorsRouter).toContain("listByForeignKey");
  });

  test("db client uses drizzle-orm/node-postgres with pg Pool", () => {
    const files = planFiles();
    const client = files.get("src/db/client.ts");

    expect(client).toContain("drizzle-orm/node-postgres");
    expect(client).toContain("pg.Pool");
    expect(client).toContain("closeDb");
  });
});
