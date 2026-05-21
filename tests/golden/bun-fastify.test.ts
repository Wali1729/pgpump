import { describe, expect, test } from "bun:test";
import { buildBunFastifyPlan } from "@pgpump/adapter-bun-fastify";
import { sampleIr } from "../fixtures/sample-ir";

const UPDATE_GOLDEN = process.env.UPDATE_GOLDEN === "1";

describe("bun-fastify golden", () => {
  test("snapshot file paths", async () => {
    const plan = buildBunFastifyPlan({
      ir: sampleIr,
      options: { outputDir: "./out", docker: true, tests: true },
    });
    const paths = plan.files.map((f) => f.path).sort();
    if (UPDATE_GOLDEN) {
      await Bun.write(
        import.meta.dir + "/bun-fastify.paths.snap.json",
        JSON.stringify(paths, null, 2),
      );
    }
    const expected = [
      ".env.example",
      "Dockerfile",
      "README.md",
      "docker-compose.yml",
      "package.json",
      "src/app.ts",
      "src/db/client.ts",
      "src/lib/errors.ts",
      "src/server.ts",
      "tests/health.test.ts",
      "tsconfig.json",
    ];
    for (const p of expected) {
      expect(paths).toContain(p);
    }
    expect(paths.filter((p) => p.startsWith("src/routes/"))).toHaveLength(3);
  });
});
