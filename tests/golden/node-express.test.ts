import { describe, expect, test } from "bun:test";
import { buildNodeExpressPlan } from "@pgpump/adapter-node-express";
import { sampleIr } from "../fixtures/sample-ir";

const UPDATE_GOLDEN = process.env.UPDATE_GOLDEN === "1";

describe("node-express golden", () => {
  test("snapshot file paths", async () => {
    const plan = buildNodeExpressPlan({
      ir: sampleIr,
      options: { outputDir: "./out", docker: true, tests: true },
    });
    const paths = plan.files.map((f) => f.path).sort();
    if (UPDATE_GOLDEN) {
      await Bun.write(
        import.meta.dir + "/node-express.paths.snap.json",
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
      "src/config.ts",
      "src/db/client.ts",
      "src/db/schema/index.ts",
      "src/lib/errors.ts",
      "src/middleware/asyncHandler.ts",
      "src/middleware/errorHandler.ts",
      "src/middleware/validate.ts",
      "src/schemas/common.ts",
      "src/server.ts",
      "tests/health.test.ts",
      "tsconfig.json",
    ];
    for (const p of expected) {
      expect(paths).toContain(p);
    }
    expect(paths.filter((p) => p.startsWith("src/routes/"))).toHaveLength(3);
    expect(paths.filter((p) => p.startsWith("src/services/"))).toHaveLength(3);
    expect(paths.filter((p) => p.startsWith("src/repositories/"))).toHaveLength(3);
    expect(paths.filter((p) => p.startsWith("src/db/schema/"))).toHaveLength(4);
    expect(paths.filter((p) => p.startsWith("src/schemas/"))).toHaveLength(4);
  });
});
