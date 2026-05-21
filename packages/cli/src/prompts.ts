import * as p from "@clack/prompts";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { ADAPTERS } from "./adapters-meta";
import { verifyConnection } from "./ui/connection";
import { c, symbols } from "./ui/theme";

export interface GeneratePromptAnswers {
  databaseUrl: string;
  target: string;
  outputDir: string;
  docker: boolean;
  tests: boolean;
  schema: string;
}

export interface IntrospectPromptAnswers {
  databaseUrl: string;
  output: string;
  schema: string;
}

function cancelGuard<T>(value: T | symbol): T {
  if (p.isCancel(value)) {
    p.cancel("Cancelled. No changes were made.");
    process.exit(0);
  }
  return value as T;
}

function validatePostgresUri(v: string | undefined): string | undefined {
  if (!v?.trim()) return "Connection URI is required";
  if (!v.startsWith("postgres://") && !v.startsWith("postgresql://")) {
    return "Must be a postgres:// or postgresql:// URI";
  }
  return undefined;
}

async function askDatabaseUrl(defaultValue?: string): Promise<string> {
  const envUrl = process.env.DATABASE_URL;
  let initial = defaultValue ?? envUrl ?? "";

  if (!defaultValue && envUrl) {
    const choice = cancelGuard(
      await p.select({
        message: `${symbols.database} Database connection`,
        options: [
          {
            value: "env",
            label: `Use ${c.accent("$DATABASE_URL")} from environment`,
            hint: envUrl.replace(/:[^:@/]+@/, ":***@"),
          },
          { value: "custom", label: "Enter a different URI" },
        ],
        initialValue: "env",
      }),
    );
    if (choice === "env") return envUrl;
    initial = "";
  }

  while (true) {
    const url = cancelGuard(
      await p.text({
        message: "PostgreSQL connection URI",
        placeholder: "postgres://user:pass@localhost:5432/mydb",
        defaultValue: initial,
        validate: validatePostgresUri,
      }),
    );

    const result = await verifyConnection(String(url));
    if (result.ok) return String(url);

    p.log.error(c.danger(result.error ?? "Could not connect"));
    const retry = cancelGuard(
      await p.confirm({
        message: "Try a different connection URI?",
        initialValue: true,
      }),
    );
    if (!retry) {
      p.cancel("Aborting — cannot proceed without a working database.");
      process.exit(1);
    }
    initial = String(url);
  }
}

async function askTarget(defaultValue?: string): Promise<string> {
  const target = cancelGuard(
    await p.select({
      message: `${symbols.package} Target framework`,
      options: ADAPTERS.map((a) => ({
        value: a.id,
        label: a.label,
        hint: a.hint,
      })),
      initialValue: defaultValue ?? "bun-fastify",
    }),
  );
  return String(target);
}

async function askOutputDir(defaultValue?: string): Promise<string> {
  const initial = defaultValue ?? "./generated-api";
  const outputDir = cancelGuard(
    await p.text({
      message: `${symbols.docs} Output directory`,
      placeholder: initial,
      defaultValue: initial,
      validate: (v) => (!v?.trim() ? "Output directory is required" : undefined),
    }),
  );

  const resolved = path.resolve(String(outputDir));
  if (existsSync(resolved)) {
    const entries = readdirSync(resolved).filter((f) => !f.startsWith("."));
    if (entries.length > 0) {
      p.log.warn(
        c.warning(
          `${resolved} contains ${entries.length} item(s) — files will be overwritten.`,
        ),
      );
      const confirm = cancelGuard(
        await p.confirm({
          message: "Continue and overwrite?",
          initialValue: false,
        }),
      );
      if (!confirm) {
        p.cancel("Cancelled — pick a different output directory.");
        process.exit(0);
      }
    }
  }
  return String(outputDir);
}

async function askExtras(defaults: {
  docker?: boolean;
  tests?: boolean;
  schema?: string;
}): Promise<{ docker: boolean; tests: boolean; schema: string }> {
  const extras = cancelGuard(
    await p.group(
      {
        docker: () =>
          p.confirm({
            message: `${symbols.wrench} Generate Docker files? ${c.muted("(Dockerfile, docker-compose.yml)")}`,
            initialValue: defaults.docker ?? true,
          }),
        tests: () =>
          p.confirm({
            message: `${symbols.spark} Generate test scaffold?`,
            initialValue: defaults.tests ?? true,
          }),
        schema: () =>
          p.text({
            message: "Postgres schema",
            placeholder: "public",
            defaultValue: defaults.schema ?? "public",
          }),
      },
      {
        onCancel: () => {
          p.cancel("Cancelled.");
          process.exit(0);
        },
      },
    ),
  );
  return {
    docker: Boolean(extras.docker),
    tests: Boolean(extras.tests),
    schema: String(extras.schema || "public"),
  };
}

function reviewNote(answers: GeneratePromptAnswers): void {
  p.note(
    [
      `${c.muted("Target".padEnd(10))} ${c.bold(answers.target)}`,
      `${c.muted("Output".padEnd(10))} ${c.bold(path.resolve(answers.outputDir))}`,
      `${c.muted("Schema".padEnd(10))} ${c.bold(answers.schema)}`,
      `${c.muted("Docker".padEnd(10))} ${answers.docker ? c.success("yes") : c.muted("no")}`,
      `${c.muted("Tests".padEnd(10))} ${answers.tests ? c.success("yes") : c.muted("no")}`,
    ].join("\n"),
    "Review",
  );
}

export async function promptGenerate(
  defaults: Partial<GeneratePromptAnswers>,
): Promise<GeneratePromptAnswers | null> {
  const databaseUrl = await askDatabaseUrl(defaults.databaseUrl);
  const target = await askTarget(defaults.target);
  const outputDir = await askOutputDir(defaults.outputDir);
  const extras = await askExtras({
    docker: defaults.docker,
    tests: defaults.tests,
    schema: defaults.schema,
  });

  const answers: GeneratePromptAnswers = {
    databaseUrl,
    target,
    outputDir,
    ...extras,
  };

  reviewNote(answers);
  const confirm = cancelGuard(
    await p.confirm({
      message: `${symbols.rocket} Proceed with generation?`,
      initialValue: true,
    }),
  );
  if (!confirm) {
    p.cancel("Generation cancelled.");
    return null;
  }
  return answers;
}

export async function promptIntrospect(
  defaults: Partial<IntrospectPromptAnswers>,
): Promise<IntrospectPromptAnswers | null> {
  const databaseUrl = await askDatabaseUrl(defaults.databaseUrl);
  const output = cancelGuard(
    await p.text({
      message: "Output IR JSON path",
      placeholder: "ir.json",
      defaultValue: defaults.output ?? "ir.json",
    }),
  );
  const schema = cancelGuard(
    await p.text({
      message: "Postgres schema",
      placeholder: "public",
      defaultValue: defaults.schema ?? "public",
    }),
  );
  return {
    databaseUrl,
    output: String(output),
    schema: String(schema),
  };
}

export type MenuChoice = "generate" | "introspect" | "list" | "quit";

export async function promptMainMenu(): Promise<MenuChoice> {
  const choice = cancelGuard(
    await p.select({
      message: "What would you like to do?",
      options: [
        {
          value: "generate",
          label: `${symbols.rocket} Generate a REST API`,
          hint: "Introspect DB → render project",
        },
        {
          value: "introspect",
          label: `${symbols.database} Introspect database`,
          hint: "Write IR JSON",
        },
        {
          value: "list",
          label: `${symbols.package} List adapters`,
          hint: "Show available targets",
        },
        { value: "quit", label: `${symbols.cross} Quit`, hint: "Exit CLI" },
      ],
      initialValue: "generate",
    }),
  );
  return choice as MenuChoice;
}
