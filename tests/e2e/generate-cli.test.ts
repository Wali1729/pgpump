import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runGeneratePipeline } from "@pgpump/core";
import { registerBuiltins } from "../../packages/cli/src/register-adapters";
import { startPostgresWithDocker } from "../fixtures/postgres";

const skip = process.env.SKIP_E2E === "1";

describe.skipIf(skip)("generate CLI pipeline e2e", () => {
  test("generates bun-fastify project from live database", async () => {
    const pg = await startPostgresWithDocker();
    const outDir = await mkdtemp(path.join(tmpdir(), "pgpump-gen-"));
    try {
      const result = await runGeneratePipeline({
        connectionString: pg.connectionString,
        target: "bun-fastify",
        outputDir: outDir,
        docker: true,
        tests: true,
        registerBuiltins,
      });
      expect(result.writtenFiles.length).toBeGreaterThan(10);
      const pkg = await readFile(path.join(outDir, "package.json"), "utf8");
      expect(pkg).toContain("fastify");
      const app = await readFile(path.join(outDir, "src/app.ts"), "utf8");
      expect(app).toContain("/health");
      expect(app).toContain("/docs");
    } finally {
      await pg.stop();
    }
  }, 180_000);
});
