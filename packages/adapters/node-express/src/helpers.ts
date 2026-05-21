import type { IrColumn, IrPrimitiveType, IrTable } from "@pgpump/core";
import { toCamelCase, toPascalCase } from "@pgpump/core";

export function irToTsType(irType: IrPrimitiveType): string {
  switch (irType) {
    case "STRING":
    case "UUID":
    case "DATE":
    case "DATETIME":
      return "string";
    case "NUMBER":
      return "number";
    case "BOOLEAN":
      return "boolean";
    case "JSON":
      return "Record<string, unknown>";
    case "BYTES":
      return "Uint8Array";
    case "ANY":
    default:
      return "unknown";
  }
}

export function irToZodType(col: IrColumn): string {
  let base: string;
  switch (col.irType) {
    case "STRING":
    case "UUID":
      base = "z.string()";
      break;
    case "NUMBER":
      base = "z.number()";
      break;
    case "BOOLEAN":
      base = "z.boolean()";
      break;
    case "DATE":
    case "DATETIME":
      base = "z.string()";
      break;
    case "JSON":
      base = "z.record(z.unknown())";
      break;
    default:
      base = "z.unknown()";
  }
  return col.nullable ? `${base}.nullable().optional()` : base;
}

export function tableEntityName(table: IrTable): string {
  return toPascalCase(table.name);
}

export function tableVarName(table: IrTable): string {
  return toCamelCase(table.name);
}

export function repositoryName(table: IrTable): string {
  return `${tableEntityName(table)}Repository`;
}

export function serviceName(table: IrTable): string {
  return `${tableEntityName(table)}Service`;
}

export function schemaExportName(table: IrTable): string {
  return tableVarName(table);
}

export function pkColumn(table: IrTable): IrColumn {
  const pk = table.primaryKeyColumns[0];
  const col = table.columns.find((c) => c.name === pk);
  if (!col) throw new Error(`No PK column for ${table.name}`);
  return col;
}

export function nonPkColumns(table: IrTable): IrColumn[] {
  return table.columns.filter((c) => !c.isPrimaryKey);
}

export function filterableColumns(table: IrTable): IrColumn[] {
  return table.columns.filter((c) => c.filterable);
}

export function sortableColumns(table: IrTable): IrColumn[] {
  return table.columns.filter((c) => c.sortable);
}

export function drizzleColumnType(irType: IrPrimitiveType): string {
  switch (irType) {
    case "STRING":
      return "text";
    case "NUMBER":
      return "integer";
    case "BOOLEAN":
      return "boolean";
    case "UUID":
      return "uuid";
    case "JSON":
    case "ANY":
      return "jsonb";
    case "BYTES":
      return "bytea";
    case "DATE":
      return "date";
    case "DATETIME":
      return "timestamp";
    default: {
      const exhaustive: never = irType;
      return exhaustive;
    }
  }
}

export function drizzleImports(columns: IrColumn[]): string[] {
  const imports = new Set<string>(["pgSchema"]);
  for (const column of columns) {
    imports.add(drizzleColumnType(column.irType));
  }
  return [...imports].sort();
}

export function drizzleColumnOptions(column: IrColumn): string {
  const parts: string[] = [];
  if (column.isPrimaryKey) parts.push(".primaryKey()");
  if (!column.nullable) parts.push(".notNull()");
  return parts.join("");
}
