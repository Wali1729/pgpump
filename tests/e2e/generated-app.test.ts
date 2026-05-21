import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runGeneratePipeline } from "@pgpump/core";
import { registerBuiltins } from "../../packages/cli/src/register-adapters";
import { startPostgresWithDocker } from "../fixtures/postgres";

const skip = process.env.SKIP_E2E === "1";

describe.skipIf(skip)("generated bun-fastify app", () => {
  test("health endpoint responds", async () => {
    const pg = await startPostgresWithDocker();
    const outDir = await mkdtemp(path.join(tmpdir(), "pgpump-app-"));
    try {
      await runGeneratePipeline({
        connectionString: pg.connectionString,
        target: "bun-fastify",
        outputDir: outDir,
        docker: false,
        tests: true,
        registerBuiltins,
      });

      const install = Bun.spawn(["bun", "install"], {
        cwd: outDir,
        stdout: "pipe",
        stderr: "pipe",
      });
      await install.exited;
      expect(install.exitCode).toBe(0);

      const proc = Bun.spawn(["bun", "src/server.ts"], {
        cwd: outDir,
        env: { ...process.env, DATABASE_URL: pg.connectionString, PORT: "3456" },
        stdout: "pipe",
        stderr: "pipe",
      });

      await Bun.sleep(2000);
      const res = await fetch("http://localhost:3456/health");
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: "ok" });

      proc.kill();
      await proc.exited;
    } finally {
      await pg.stop();
    }
  }, 240_000);
});
