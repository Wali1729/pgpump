import { describe, expect, test } from "bun:test";
import { runIntrospectPipeline } from "@pgpump/core";
import { startPostgresWithDocker } from "../../fixtures/postgres";

const skip = process.env.SKIP_E2E === "1";

describe.skipIf(skip)("runIntrospectPipeline", () => {
  test("delegates to postgres introspection", async () => {
    const pg = await startPostgresWithDocker();
    try {
      const ir = await runIntrospectPipeline({
        connectionString: pg.connectionString,
      });
      expect(ir.tables.length).toBe(3);
    } finally {
      await pg.stop();
    }
  }, 120_000);
});
