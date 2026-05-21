import type { GenerationWarning, IrDatabase, IrRelation } from "../ir/types";
import { toRouteName } from "../utils/naming";

interface FkEdge {
  parentTable: string;
  parentColumn: string;
  childTable: string;
  childColumn: string;
}

function detectCycles(edges: FkEdge[]): Set<string> {
  const graph = new Map<string, string[]>();
  for (const e of edges) {
    const list = graph.get(e.parentTable) ?? [];
    list.push(e.childTable);
    graph.set(e.parentTable, list);
  }

  const cyclic = new Set<string>();
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function dfs(node: string, path: string[]) {
    if (visiting.has(node)) {
      const cycleStart = path.indexOf(node);
      if (cycleStart >= 0) {
        for (let i = cycleStart; i < path.length; i++) {
          cyclic.add(`${path[i]}->${path[i + 1] ?? node}`);
        }
        cyclic.add(`${path[path.length - 1]}->${node}`);
      }
      return;
    }
    if (visited.has(node)) return;
    visiting.add(node);
    path.push(node);
    for (const next of graph.get(node) ?? []) {
      dfs(next, [...path]);
    }
    visiting.delete(node);
    visited.add(node);
  }

  for (const node of graph.keys()) dfs(node, []);
  return cyclic;
}

function roleFromColumn(columnName: string): string {
  // Strip a trailing `_id` (or `Id`) so `approved_by_id` -> `approved-by`.
  const stripped = columnName.replace(/_id$/i, "").replace(/Id$/, "");
  return toRouteName(stripped || columnName);
}

export function planRelations(
  edges: FkEdge[],
  warnings: GenerationWarning[],
): IrRelation[] {
  const cycles = detectCycles(edges);
  const relations: IrRelation[] = [];

  const groups = new Map<string, FkEdge[]>();
  for (const edge of edges) {
    const key = `${edge.parentTable}|${edge.childTable}`;
    const list = groups.get(key) ?? [];
    list.push(edge);
    groups.set(key, list);
  }

  for (const edge of edges) {
    const edgeKey = `${edge.parentTable}->${edge.childTable}`;
    const skip = cycles.has(edgeKey);
    if (skip) {
      warnings.push({
        code: "CIRCULAR_FK_SKIP",
        message: `Skipping nested route for circular FK ${edge.parentTable} -> ${edge.childTable}`,
        table: edge.childTable,
      });
    }
    const parentRoute = toRouteName(edge.parentTable);
    const childRoute = toRouteName(edge.childTable);
    const siblings = groups.get(`${edge.parentTable}|${edge.childTable}`) ?? [];
    const needsDisambiguation = siblings.length > 1;
    const role = roleFromColumn(edge.childColumn);
    const nestedRoute = needsDisambiguation
      ? `/${parentRoute}/:parentId/${childRoute}/by-${role}`
      : `/${parentRoute}/:parentId/${childRoute}`;

    if (needsDisambiguation && !skip) {
      warnings.push({
        code: "NESTED_ROUTE_DISAMBIGUATED",
        message: `Multiple FKs from ${edge.childTable} -> ${edge.parentTable}; suffixed route with /by-${role} (column ${edge.childColumn})`,
        table: edge.childTable,
      });
    }

    relations.push({
      id: `${edge.parentTable}_${edge.childTable}_${edge.childColumn}`,
      parentTable: edge.parentTable,
      parentColumn: edge.parentColumn,
      childTable: edge.childTable,
      childColumn: edge.childColumn,
      type: "one-to-many",
      nestedRoute,
      skipNestedRoute: skip,
      skipReason: skip ? "circular_foreign_key" : undefined,
    });
  }

  return relations;
}

export function enrichIrWithRelations(ir: IrDatabase): IrDatabase {
  const edges: FkEdge[] = [];
  for (const table of ir.tables) {
    for (const col of table.columns) {
      if (col.foreignKey) {
        edges.push({
          parentTable: col.foreignKey.table,
          parentColumn: col.foreignKey.column,
          childTable: table.name,
          childColumn: col.name,
        });
      }
    }
  }
  const relations = planRelations(edges, ir.warnings);
  return { ...ir, relations };
}
