import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { resolveSafePath, sortRenderFiles, writeRenderPlan } from "@pgpump/core";

describe("writeRenderPlan", () => {
  test("writes sorted files under output directory", async () => {
    const outDir = await mkdtemp(path.join(tmpdir(), "pgpump-write-"));
    const written = await writeRenderPlan(outDir, {
      files: [
        { path: "b.txt", contents: "second" },
        { path: "a.txt", contents: "first" },
      ],
      warnings: [],
    });
    expect(written).toHaveLength(2);
    const a = await readFile(path.join(outDir, "a.txt"), "utf8");
    expect(a).toBe("first");
  });

  test("sortRenderFiles orders by path", () => {
    const sorted = sortRenderFiles([
      { path: "z.ts", contents: "" },
      { path: "a.ts", contents: "" },
    ]);
    expect(sorted.map((f) => f.path)).toEqual(["a.ts", "z.ts"]);
  });

  test("resolveSafePath rejects paths that escape output directory", () => {
    expect(() =>
      resolveSafePath("/tmp/out", "nested/../../../etc/passwd"),
    ).toThrow(/escapes|traversal/);
  });
});
