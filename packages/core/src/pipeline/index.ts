import type { GenerationOptions, IrDatabase, RenderPlan } from "../ir/types";
import { introspectPostgres, type IntrospectOptions } from "../introspection/postgres";
import { applyConfigToRegistry, loadConfig } from "../config/loader";
import { createDefaultRegistry } from "../registry";
import { writeRenderPlan } from "../writer/output";

export interface GeneratePipelineOptions extends IntrospectOptions {
  target: string;
  outputDir: string;
  docker?: boolean;
  tests?: boolean;
  configPath?: string;
  registerBuiltins: (registry: ReturnType<typeof createDefaultRegistry>) => void;
}

export interface GenerateResult {
  ir: IrDatabase;
  plan: RenderPlan;
  writtenFiles: string[];
}

export async function runGeneratePipeline(
  options: GeneratePipelineOptions,
): Promise<GenerateResult> {
  const ir = await introspectPostgres({
    connectionString: options.connectionString,
    schema: options.schema,
  });

  const registry = createDefaultRegistry();
  options.registerBuiltins(registry);

  const config = await loadConfig(options.configPath);
  applyConfigToRegistry(registry, config);

  const genOptions: GenerationOptions = {
    outputDir: options.outputDir,
    docker: options.docker ?? false,
    tests: options.tests ?? false,
  };

  const plan = await registry.buildRenderPlan(options.target, {
    ir,
    options: genOptions,
  });

  const writtenFiles = await writeRenderPlan(options.outputDir, plan);
  return { ir, plan, writtenFiles };
}

export async function runIntrospectPipeline(
  options: IntrospectOptions,
): Promise<IrDatabase> {
  return introspectPostgres(options);
}
