#!/usr/bin/env bun
import * as p from "@clack/prompts";
import { Command } from "commander";
import { runGenerateCommand } from "./commands/generate";
import { runIntrospectCommand } from "./commands/introspect";
import { runListCommand } from "./commands/list";
import {
  promptGenerate,
  promptIntrospect,
  promptMainMenu,
} from "./prompts";
import { printBanner } from "./ui/banner";
import { c, symbols } from "./ui/theme";

const VERSION = "0.1.0";

function isTty(): boolean {
  return Boolean(process.stdout.isTTY && process.stdin.isTTY);
}

async function interactiveSession(): Promise<number> {
  printBanner(VERSION);
  p.intro(c.bold(c.brand(" PGPump ")));

  while (true) {
    const choice = await promptMainMenu();
    if (choice === "quit") {
      p.outro(`${symbols.spark} ${c.brand("Bye!")}`);
      return 0;
    }
    if (choice === "list") {
      runListCommand();
      continue;
    }
    if (choice === "introspect") {
      const answers = await promptIntrospect({});
      if (!answers) continue;
      const code = await runIntrospectCommand({
        databaseUrl: answers.databaseUrl,
        output: answers.output,
        schema: answers.schema,
      });
      if (code !== 0) return code;
      continue;
    }
    if (choice === "generate") {
      const answers = await promptGenerate({});
      if (!answers) continue;
      const code = await runGenerateCommand({
        databaseUrl: answers.databaseUrl,
        target: answers.target,
        outputDir: answers.outputDir,
        docker: answers.docker,
        tests: answers.tests,
        schema: answers.schema,
      });
      if (code !== 0) return code;
      continue;
    }
  }
}

const program = new Command();

program
  .name("pgpump")
  .description("PostgreSQL database to REST API generator")
  .version(VERSION)
  .option("--no-banner", "Suppress the ASCII banner");

program
  .command("list")
  .description("List available target adapters")
  .action(() => {
    if (program.opts().banner !== false) printBanner(VERSION);
    process.exit(runListCommand());
  });

program
  .command("introspect")
  .description("Introspect database and write IR JSON")
  .option("-d, --database-url <url>", "PostgreSQL connection URI")
  .option("-o, --output <path>", "Output IR JSON path", "ir.json")
  .option("--schema <name>", "Schema name", "public")
  .option("-y, --yes", "Skip prompts (non-interactive)")
  .action(async (opts) => {
    const databaseUrl = opts.databaseUrl ?? process.env.DATABASE_URL;
    if (opts.yes || !isTty()) {
      if (!databaseUrl) {
        console.error("Error: --database-url is required");
        process.exit(1);
      }
      process.exit(
        await runIntrospectCommand({
          databaseUrl,
          output: opts.output,
          schema: opts.schema,
        }),
      );
    }

    if (program.opts().banner !== false) printBanner(VERSION);
    p.intro(c.bold(c.brand(" PGPump · Introspect ")));
    const answers = await promptIntrospect({
      databaseUrl,
      output: opts.output,
      schema: opts.schema,
    });
    if (!answers) process.exit(0);
    process.exit(
      await runIntrospectCommand({
        databaseUrl: answers.databaseUrl,
        output: answers.output,
        schema: answers.schema,
      }),
    );
  });

program
  .command("generate")
  .description("Generate a REST API project from PostgreSQL")
  .option("-d, --database-url <url>", "PostgreSQL connection URI")
  .option("-t, --target <id>", "Target adapter id")
  .option("-o, --output <dir>", "Output directory", "./generated-api")
  .option("--docker", "Generate Docker files")
  .option("--no-docker", "Skip Docker files")
  .option("--tests", "Generate test scaffold")
  .option("--no-tests", "Skip test scaffold")
  .option("-c, --config <path>", "pgpump.config.ts path")
  .option("--schema <name>", "Schema name", "public")
  .option("-y, --yes", "Skip prompts (non-interactive)")
  .action(async (opts) => {
    const databaseUrl = opts.databaseUrl ?? process.env.DATABASE_URL;
    const nonInteractive = opts.yes || !isTty();

    if (nonInteractive) {
      if (!databaseUrl || !opts.target) {
        console.error(
          "Error: --database-url (or $DATABASE_URL) and --target are required in non-interactive mode",
        );
        process.exit(1);
      }
      process.exit(
        await runGenerateCommand({
          databaseUrl,
          target: opts.target,
          outputDir: opts.output,
          docker: opts.docker !== false,
          tests: opts.tests !== false,
          configPath: opts.config,
          schema: opts.schema,
        }),
      );
    }

    if (program.opts().banner !== false) printBanner(VERSION);
    p.intro(c.bold(c.brand(" PGPump · Generate ")));
    const answers = await promptGenerate({
      databaseUrl,
      target: opts.target,
      outputDir: opts.output,
      docker: opts.docker !== false,
      tests: opts.tests !== false,
      schema: opts.schema,
    });
    if (!answers) process.exit(0);
    process.exit(
      await runGenerateCommand({
        databaseUrl: answers.databaseUrl,
        target: answers.target,
        outputDir: answers.outputDir,
        docker: answers.docker,
        tests: answers.tests,
        configPath: opts.config,
        schema: answers.schema,
      }),
    );
  });

if (process.argv.length <= 2) {
  if (!isTty()) {
    program.outputHelp();
    process.exit(1);
  }
  interactiveSession()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
} else {
  program.parse();
}
