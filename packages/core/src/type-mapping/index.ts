import type { IrPrimitiveType } from "../ir/types";

const EXACT_MAP: Record<string, IrPrimitiveType> = {
  smallint: "NUMBER",
  integer: "NUMBER",
  bigint: "NUMBER",
  decimal: "NUMBER",
  numeric: "NUMBER",
  real: "NUMBER",
  "double precision": "NUMBER",
  smallserial: "NUMBER",
  serial: "NUMBER",
  bigserial: "NUMBER",
  boolean: "BOOLEAN",
  char: "STRING",
  character: "STRING",
  "character varying": "STRING",
  varchar: "STRING",
  text: "STRING",
  name: "STRING",
  citext: "STRING",
  uuid: "UUID",
  date: "DATE",
  time: "DATETIME",
  "time without time zone": "DATETIME",
  "time with time zone": "DATETIME",
  timestamp: "DATETIME",
  "timestamp without time zone": "DATETIME",
  "timestamp with time zone": "DATETIME",
  timestamptz: "DATETIME",
  json: "JSON",
  jsonb: "JSON",
  bytea: "BYTES",
};

const ANY_TYPES = new Set([
  "tsvector",
  "tsquery",
  "inet",
  "cidr",
  "macaddr",
  "macaddr8",
  "point",
  "line",
  "lseg",
  "box",
  "path",
  "polygon",
  "circle",
  "interval",
  "money",
  "xml",
  "bit",
  "varbit",
  "oid",
  "regclass",
  "regproc",
  "regtype",
  "regrole",
  "regnamespace",
  "regconfig",
  "regdictionary",
]);

export function normalizePgType(dbType: string): string {
  return dbType.toLowerCase().trim();
}

export function mapPostgresTypeToIr(dbType: string): IrPrimitiveType {
  const normalized = normalizePgType(dbType);
  if (EXACT_MAP[normalized]) return EXACT_MAP[normalized];
  if (normalized.startsWith("_")) return "ANY";
  if (ANY_TYPES.has(normalized)) return "ANY";
  if (normalized.includes("[]")) return "JSON";
  if (normalized.startsWith("enum")) return "STRING";
  return "ANY";
}

export function isFilterable(irType: IrPrimitiveType): boolean {
  return irType !== "BYTES" && irType !== "ANY";
}

export function isSortable(irType: IrPrimitiveType): boolean {
  return ["STRING", "NUMBER", "BOOLEAN", "DATE", "DATETIME", "UUID"].includes(
    irType,
  );
}
