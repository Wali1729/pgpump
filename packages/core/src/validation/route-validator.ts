import type { RenderPlan } from "../ir/types";

export interface DuplicateRoute {
  method: string;
  path: string;
  files: string[];
}

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"];

// scope: "global" patterns share one mount point (e.g. Fastify `app`,
// FastAPI `@app`); "file" patterns are per-router and only collide
// within the same file (e.g. Express `router`, FastAPI `@router`).
interface RoutePattern {
  scope: "global" | "file";
  make: (method: string) => RegExp;
}

// `(?<!@)` prevents the JS patterns from matching Python decorators like
// `@router.get(...)` or `@app.get(...)` — those are handled by the dedicated
// decorator patterns below.
const ROUTE_PATTERNS: RoutePattern[] = [
  {
    scope: "global",
    make: (method) =>
      new RegExp(
        `(?<![@\\w])(?:app|fastify|server)\\.${method}\\(\\s*["\`]([^"\`]+)["\`]`,
        "g",
      ),
  },
  {
    scope: "file",
    make: (method) =>
      new RegExp(
        `(?<![@\\w])router\\.${method}\\(\\s*["\`]([^"\`]+)["\`]`,
        "g",
      ),
  },
  {
    scope: "global",
    make: (method) => new RegExp(`@app\\.${method}\\(\\s*["']([^"']+)["']`, "g"),
  },
  {
    scope: "file",
    make: (method) =>
      new RegExp(`@router\\.${method}\\(\\s*["']([^"']+)["']`, "g"),
  },
];

interface RouteHit {
  method: string;
  path: string;
  file: string;
  scope: string;
}

function extractRoutes(plan: RenderPlan): RouteHit[] {
  const hits: RouteHit[] = [];
  for (const file of plan.files) {
    for (const method of HTTP_METHODS) {
      for (const pattern of ROUTE_PATTERNS) {
        const re = pattern.make(method);
        for (const match of file.contents.matchAll(re)) {
          hits.push({
            method: method.toUpperCase(),
            path: match[1],
            file: file.path,
            scope: pattern.scope === "global" ? "::global::" : file.path,
          });
        }
      }
    }
  }
  return hits;
}

export function findDuplicateRoutes(plan: RenderPlan): DuplicateRoute[] {
  const groups = new Map<string, RouteHit[]>();
  for (const hit of extractRoutes(plan)) {
    const key = `${hit.scope}::${hit.method} ${hit.path}`;
    const list = groups.get(key) ?? [];
    list.push(hit);
    groups.set(key, list);
  }
  const dupes: DuplicateRoute[] = [];
  for (const hits of groups.values()) {
    if (hits.length <= 1) continue;
    dupes.push({
      method: hits[0].method,
      path: hits[0].path,
      files: hits.map((h) => h.file),
    });
  }
  return dupes;
}

export function assertNoDuplicateRoutes(plan: RenderPlan): void {
  const dupes = findDuplicateRoutes(plan);
  if (dupes.length === 0) return;
  const detail = dupes
    .map(
      (d) =>
        `  ${d.method} ${d.path} — declared in ${d.files.join(", ")}`,
    )
    .join("\n");
  throw new Error(
    `Duplicate route(s) detected in render plan:\n${detail}\n\nThis would crash the generated server (e.g. Fastify FST_ERR_DUPLICATED_ROUTE).`,
  );
}
