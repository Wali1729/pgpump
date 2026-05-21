import type { IrColumn, IrPrimitiveType } from "@pgpump/core";

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
