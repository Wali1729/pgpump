import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RenderFile, RenderPlan } from "../ir/types";

export function resolveSafePath(outputDir: string, filePath: string): string {
  const normalized = path.normalize(filePath);
  if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
    throw new Error(`Path traversal rejected: ${filePath}`);
  }
  const resolved = path.resolve(outputDir, normalized);
  const base = path.resolve(outputDir);
  if (!resolved.startsWith(base + path.sep) && resolved !== base) {
    throw new Error(`Path escapes output directory: ${filePath}`);
  }
  return resolved;
}

export async function writeRenderPlan(
  outputDir: string,
  plan: RenderPlan,
): Promise<string[]> {
  const written: string[] = [];
  const sorted = [...plan.files].sort((a, b) => a.path.localeCompare(b.path));

  for (const file of sorted) {
    const target = resolveSafePath(outputDir, file.path);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.contents, "utf8");
    written.push(target);
  }
  return written;
}

export function sortRenderFiles(files: RenderFile[]): RenderFile[] {
  return [...files].sort((a, b) => a.path.localeCompare(b.path));
}
