import * as p from "@clack/prompts";
import path from "node:path";
import {
  applyConfigToRegistry,
  createDefaultRegistry,
  introspectPostgres,
  loadConfig,
  writeRenderPlan,
  type IrDatabase,
  type RenderPlan,
} from "@pgpump/core";
import { sanitizeConnectionString } from "../errors";
import { findAdapterMeta } from "../adapters-meta";
import { registerBuiltins } from "../register-adapters";
import { renderSummaryPanel } from "../ui/summary";
import { c, symbols } from "../ui/theme";

export interface GenerateCommandOptions {
  databaseUrl: string;
  target: string;
  outputDir: string;
  docker: boolean;
  tests: boolean;
  configPath?: string;
  schema?: string;
}

export async function runGenerateCommand(
  opts: GenerateCommandOptions,
): Promise<number> {
  const outputDir = path.resolve(opts.outputDir);
  const spinner = p.spinner();
  let ir: IrDatabase | undefined;
  let plan: RenderPlan | undefined;
  let writtenFiles: string[] = [];

  try {
    spinner.start(`${c.accent("Introspecting database")} ${c.muted("(reading information_schema)")}`);
    ir = await introspectPostgres({
      connectionString: opts.databaseUrl,
      schema: opts.schema,
    });

    spinner.message(
      `${c.accent("Loading adapters")} ${c.muted(`(${opts.target})`)}`,
    );
    const registry = createDefaultRegistry();
    registerBuiltins(registry);
    if (opts.configPath) {
      const config = await loadConfig(opts.configPath);
      applyConfigToRegistry(registry, config);
    }

    spinner.message(
      `${c.accent("Planning files")} ${c.muted(`(${ir.tables.length} tables · ${ir.relations.length} relations)`)}`,
    );
    plan = await registry.buildRenderPlan(opts.target, {
      ir,
      options: { outputDir, docker: opts.docker, tests: opts.tests },
    });

    spinner.message(
      `${c.accent("Writing files")} ${c.muted(`(${plan.files.length} files → ${outputDir})`)}`,
    );
    writtenFiles = await writeRenderPlan(outputDir, plan);

    spinner.stop(
      `${symbols.check} ${c.success("Project generated")} ${c.muted(`(${writtenFiles.length} files)`)}`,
    );
  } catch (err) {
    spinner.stop(
      `${symbols.cross} ${c.danger("Generation failed")}`,
      1,
    );
    p.log.error(c.danger(err instanceof Error ? err.message : String(err)));
    p.log.info(
      c.muted("No partial output guarantee — verify connection and target."),
    );
    return 1;
  }

  const meta = findAdapterMeta(opts.target);
  const items = [
    { label: "Target", value: meta?.label ?? opts.target },
    { label: "Database", value: ir.database },
    { label: "Tables", value: String(ir.tables.length) },
    { label: "Relations", value: String(ir.relations.length) },
    { label: "Files", value: String(writtenFiles.length) },
    { label: "Warnings", value: String(plan.warnings.length) },
    { label: "Output", value: outputDir },
    { label: "Connection", value: sanitizeConnectionString(opts.databaseUrl) },
  ];

  const nextSteps = buildNextSteps(opts.target, outputDir);
  console.log(
    renderSummaryPanel({
      title: ` ${symbols.spark} ${c.bold("Generation Summary")} `,
      items,
      footer: nextSteps,
      variant: "success",
    }),
  );

  if (plan.warnings.length) {
    p.log.warn(c.warning(`${plan.warnings.length} warning(s):`));
    for (const w of plan.warnings.slice(0, 5)) {
      console.log(`  ${symbols.warn} ${c.muted(`[${w.code}]`)} ${w.message}`);
    }
    if (plan.warnings.length > 5) {
      console.log(c.muted(`  …and ${plan.warnings.length - 5} more`));
    }
  }

  p.outro(`${symbols.rocket} ${c.brand("Happy shipping!")}`);
  return 0;
}

function buildNextSteps(target: string, outputDir: string): string[] {
  const cd = `cd ${outputDir}`;
  switch (target) {
    case "bun-fastify":
      return [
        c.muted(cd),
        c.muted("bun install"),
        c.muted("cp .env.example .env"),
        c.muted("bun run dev   ") + c.accent("# http://localhost:3000/docs"),
      ];
    case "python-fastapi":
      return [
        c.muted(cd),
        c.muted("python -m venv .venv && . .venv/bin/activate"),
        c.muted("pip install -r requirements.txt"),
        c.muted("uvicorn main:app --reload   ") + c.accent("# /docs"),
      ];
    case "node-express":
      return [
        c.muted(cd),
        c.muted("npm install"),
        c.muted("npm run dev   ") + c.accent("# /api-docs"),
      ];
    default:
      return [c.muted(cd)];
  }
}
