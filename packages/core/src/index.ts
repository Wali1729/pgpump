export * from "./ir/types";
export { validateIrDatabase, irDatabaseSchema } from "./ir/schema";
export * from "./type-mapping";
export {
  introspectPostgres,
  pingPostgres,
  type PingResult,
} from "./introspection/postgres";
export {
  assertNoDuplicateRoutes,
  findDuplicateRoutes,
  type DuplicateRoute,
} from "./validation/route-validator";
export { planRelations, enrichIrWithRelations } from "./relations/planner";
export { AdapterRegistry, createDefaultRegistry } from "./registry";
export { loadConfig, applyConfigToRegistry, type PgpumpConfig } from "./config/loader";
export {
  writeRenderPlan,
  resolveSafePath,
  sortRenderFiles,
} from "./writer/output";
export { runGeneratePipeline, runIntrospectPipeline } from "./pipeline";
export * from "./utils/naming";
