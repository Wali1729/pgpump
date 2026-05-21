import { describe, expect, test } from "bun:test";
import { buildBunFastifyPlan } from "@pgpump/adapter-bun-fastify";
import { toCamelCase } from "@pgpump/core";
import { sampleIr } from "../../fixtures/sample-ir";

function planFiles() {
  return new Map(
    buildBunFastifyPlan({
      ir: sampleIr,
      options: { outputDir: "./out", docker: true, tests: true },
    }).files.map((file) => [file.path, file.contents]),
  );
}

describe("bun-fastify modular architecture", () => {
  test("emits separate schema, zod, repository, service, and route modules per table", () => {
    const files = planFiles();

    for (const table of sampleIr.tables) {
      const varName = toCamelCase(table.name);
      expect(files.has(`src/db/schema/${varName}.ts`)).toBe(true);
      expect(files.has(`src/schemas/${varName}.ts`)).toBe(true);
      expect(files.has(`src/repositories/${varName}.ts`)).toBe(true);
      expect(files.has(`src/services/${varName}.ts`)).toBe(true);
      expect(files.has(`src/routes/${varName}.ts`)).toBe(true);
    }
  });

  test("routes stay thin and delegate to services", () => {
    const files = planFiles();

    for (const table of sampleIr.tables) {
      const route = files.get(`src/routes/${toCamelCase(table.name)}.ts`);
      expect(route).toBeTruthy();
      expect(route).not.toContain("drizzle(");
      expect(route).not.toContain("db.select");
      expect(route).not.toContain("db.insert");
      expect(route).not.toContain("sql`");
      expect(route).not.toContain('from "../db/client"');
      expect(route).toContain("service.");
    }
  });

  test("repositories own Drizzle query construction", () => {
    const files = planFiles();
    const repository = files.get("src/repositories/authors.ts");

    expect(repository).toContain('from "drizzle-orm"');
    expect(repository).toContain(".select()");
    expect(repository).toContain(".insert(");
    expect(repository).toContain("SORT_COLUMNS");
  });

  test("services map missing entities to NOT_FOUND", () => {
    const files = planFiles();
    const service = files.get("src/services/authors.ts");

    expect(service).toContain('AppError(404, "NOT_FOUND"');
  });

  test("nested routes delegate to child service listByForeignKey", () => {
    const files = planFiles();
    const authorsRoute = files.get("src/routes/authors.ts");

    expect(authorsRoute).toContain("listByForeignKey");
    expect(authorsRoute).toContain("booksService");
    expect(authorsRoute).not.toContain("sql`");
  });

  test("package.json includes drizzle-orm and db schema layer", () => {
    const files = planFiles();

    expect(files.get("package.json")).toContain("drizzle-orm");
    expect(files.has("src/db/client.ts")).toBe(true);
    expect(files.has("src/db/schema/index.ts")).toBe(true);
    expect(files.has("src/schemas/common.ts")).toBe(true);
    expect(files.has("src/config.ts")).toBe(true);
    expect(files.has("src/types/authors.ts")).toBe(false);
  });
});
