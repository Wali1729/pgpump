import * as p from "@clack/prompts";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { runIntrospectPipeline } from "@pgpump/core";
import { sanitizeConnectionString } from "../errors";
import { renderSummaryPanel } from "../ui/summary";
import { c, symbols } from "../ui/theme";

export interface IntrospectOptions {
  databaseUrl: string;
  output: string;
  schema?: string;
}

export async function runIntrospectCommand(
  opts: IntrospectOptions,
): Promise<number> {
  const spinner = p.spinner();
  spinner.start(
    `${c.accent("Introspecting")} ${c.muted(sanitizeConnectionString(opts.databaseUrl))}`,
  );
  try {
    const ir = await runIntrospectPipeline({
      connectionString: opts.databaseUrl,
      schema: opts.schema,
    });
    const outPath = path.resolve(opts.output);
    spinner.message(`${c.accent("Writing IR JSON")} ${c.muted(outPath)}`);
    await writeFile(outPath, JSON.stringify(ir, null, 2), "utf8");
    spinner.stop(
      `${symbols.check} ${c.success("IR generated")} ${c.muted(`(${outPath})`)}`,
    );

    console.log(
      renderSummaryPanel({
        title: ` ${symbols.database} ${c.bold("Introspection Summary")} `,
        items: [
          { label: "Database", value: ir.database },
          { label: "Schema", value: opts.schema ?? "public" },
          { label: "Tables", value: String(ir.tables.length) },
          { label: "Relations", value: String(ir.relations.length) },
          { label: "Warnings", value: String(ir.warnings.length) },
          { label: "Output", value: outPath },
        ],
        variant: "info",
      }),
    );

    if (ir.warnings.length) {
      p.log.warn(c.warning(`${ir.warnings.length} warning(s):`));
      for (const w of ir.warnings.slice(0, 5)) {
        console.log(`  ${symbols.warn} ${c.muted(`[${w.code}]`)} ${w.message}`);
      }
    }
    p.outro(`${symbols.spark} ${c.brand("Done")}`);
    return 0;
  } catch (err) {
    spinner.stop(
      `${symbols.cross} ${c.danger("Introspection failed")}`,
      1,
    );
    p.log.error(c.danger(err instanceof Error ? err.message : String(err)));
    p.log.info(c.muted("Check DATABASE_URL and network connectivity."));
    return 1;
  }
}
