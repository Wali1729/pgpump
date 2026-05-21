import { describe, expect, test } from "bun:test";
import { runIntrospectPipeline } from "@pgpump/core";
import { startPostgresWithDocker } from "../fixtures/postgres";

const skip = process.env.SKIP_E2E === "1";

describe.skipIf(skip)("introspectPostgres integration", () => {
  test("introspects canonical fixture schema", async () => {
    const pg = await startPostgresWithDocker();
    try {
      const ir = await runIntrospectPipeline({
        connectionString: pg.connectionString,
      });
      expect(ir.tables.length).toBe(3);
      const names = ir.tables.map((t) => t.name).sort();
      expect(names).toEqual(["authors", "books", "reviews"]);
      const books = ir.tables.find((t) => t.name === "books")!;
      const authorFk = books.columns.find((c) => c.name === "author_id");
      expect(authorFk?.isForeignKey).toBe(true);
      expect(authorFk?.foreignKey?.table).toBe("authors");
      expect(ir.relations.length).toBeGreaterThanOrEqual(1);
    } finally {
      await pg.stop();
    }
  }, 120_000);
});
