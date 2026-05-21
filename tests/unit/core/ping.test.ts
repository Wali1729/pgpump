import { describe, expect, test } from "bun:test";
import { pingPostgres } from "@pgpump/core";
import { startPostgresWithDocker } from "../../fixtures/postgres";

const skip = process.env.SKIP_E2E === "1";

describe("pingPostgres", () => {
  test("returns ok=false for unreachable host", async () => {
    const result = await pingPostgres(
      "postgres://nobody:nobody@127.0.0.1:1/none",
      500,
    );
    expect(result.ok).toBe(false);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeTruthy();
  }, 10_000);

  test("returns ok=false for invalid URI", async () => {
    const result = await pingPostgres("not-a-valid-url", 500);
    expect(result.ok).toBe(false);
  }, 5_000);
});

describe.skipIf(skip)("pingPostgres (live)", () => {
  test("returns ok=true for live database", async () => {
    const pg = await startPostgresWithDocker();
    try {
      const result = await pingPostgres(pg.connectionString);
      expect(result.ok).toBe(true);
      expect(result.serverVersion).toContain("PostgreSQL");
      expect(result.database).toBe("pgpump_test");
    } finally {
      await pg.stop();
    }
  }, 120_000);
});
