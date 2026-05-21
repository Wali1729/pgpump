import { ADAPTERS } from "../adapters-meta";
import { renderSummaryPanel } from "../ui/summary";
import { c, symbols } from "../ui/theme";

export function runListCommand(): number {
  console.log();
  console.log(`  ${c.bold(c.brand("Available adapters"))}`);
  console.log();
  for (const adapter of ADAPTERS) {
    console.log(
      renderSummaryPanel({
        title: ` ${symbols.package} ${c.bold(adapter.label)} ${c.muted(`(${adapter.id})`)} `,
        items: [
          { label: "Language", value: adapter.language },
          { label: "Server", value: adapter.server },
          { label: "Validation", value: adapter.validation },
          { label: "DB client", value: adapter.client },
          { label: "Docs", value: adapter.docs },
        ],
        variant: "info",
      }),
    );
  }
  console.log(
    `  ${c.muted("Add your own via")} ${c.accent("pgpump.config.ts")} ${c.muted("(see docs/ADAPTER_AUTHORING.md)")}`,
  );
  console.log();
  return 0;
}
