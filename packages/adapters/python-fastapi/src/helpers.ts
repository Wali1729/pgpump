import type { IrColumn, IrPrimitiveType, IrTable } from "@pgpump/core";
import { toPascalCase } from "@pgpump/core";

export function moduleName(table: IrTable): string {
  return table.name;
}

export function entityName(table: IrTable): string {
  return toPascalCase(table.name);
}

export function repositoryName(table: IrTable): string {
  return `${entityName(table)}Repository`;
}

export function serviceName(table: IrTable): string {
  return `${entityName(table)}Service`;
}

export function pkColumn(table: IrTable): IrColumn {
  const pk = table.primaryKeyColumns[0];
  const column = table.columns.find((c) => c.name === pk);
  if (!column) {
    throw new Error(`No PK column for ${table.name}`);
  }
  return column;
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

export function pyType(irType: IrPrimitiveType): string {
  switch (irType) {
    case "STRING":
      return "str";
    case "NUMBER":
      return "int";
    case "BOOLEAN":
      return "bool";
    case "DATE":
      return "date";
    case "DATETIME":
      return "datetime";
    case "UUID":
      return "UUID";
    case "JSON":
      return "dict[str, Any]";
    case "BYTES":
      return "bytes";
    case "ANY":
      return "Any";
    default: {
      const exhaustive: never = irType;
      return exhaustive;
    }
  }
}

export function sqlalchemyType(irType: IrPrimitiveType): string {
  switch (irType) {
    case "STRING":
      return "String";
    case "NUMBER":
      return "Integer";
    case "BOOLEAN":
      return "Boolean";
    case "DATE":
      return "Date";
    case "DATETIME":
      return "DateTime";
    case "UUID":
      return "Uuid";
    case "JSON":
    case "ANY":
      return "JSON";
    case "BYTES":
      return "LargeBinary";
    default: {
      const exhaustive: never = irType;
      return exhaustive;
    }
  }
}

export function pythonDefaultImportTypes(columns: IrColumn[]): string[] {
  const imports = new Set<string>();
  for (const column of columns) {
    switch (column.irType) {
      case "DATE":
        imports.add("date");
        break;
      case "DATETIME":
        imports.add("datetime");
        break;
      case "UUID":
        imports.add("UUID");
        break;
      case "JSON":
      case "ANY":
        imports.add("Any");
        break;
      case "STRING":
      case "NUMBER":
      case "BOOLEAN":
      case "BYTES":
        break;
      default: {
        const exhaustive: never = column.irType;
        return [exhaustive];
      }
    }
  }
  return [...imports].sort();
}

export function sqlalchemyImports(columns: IrColumn[]): string[] {
  const imports = new Set<string>();
  for (const column of columns) {
    imports.add(sqlalchemyType(column.irType));
  }
  return [...imports].sort();
}

export function schemaClass(table: IrTable, suffix: string): string {
  return `${entityName(table)}${suffix}`;
}
