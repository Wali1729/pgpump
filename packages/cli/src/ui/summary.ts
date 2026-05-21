import boxen from "boxen";
import { c, palette, symbols } from "./theme";

export interface SummaryItem {
  label: string;
  value: string;
}

export interface SummaryPanelOptions {
  title: string;
  items: SummaryItem[];
  footer?: string[];
  variant?: "success" | "info" | "danger";
}

function borderColor(variant: SummaryPanelOptions["variant"]): string {
  switch (variant) {
    case "success":
      return palette.success;
    case "danger":
      return palette.danger;
    default:
      return palette.accent;
  }
}

export function renderSummaryPanel(opts: SummaryPanelOptions): string {
  const labelWidth = Math.max(...opts.items.map((i) => i.label.length));
  const lines = opts.items.map(
    (i) =>
      `${c.muted(i.label.padEnd(labelWidth))}  ${c.bold(i.value)}`,
  );
  const body = lines.join("\n");
  const footer = opts.footer?.length
    ? `\n${c.muted("─".repeat(48))}\n${opts.footer.map((l) => `${symbols.arrow} ${l}`).join("\n")}`
    : "";
  return boxen(`${body}${footer}`, {
    title: opts.title,
    titleAlignment: "left",
    padding: { top: 1, bottom: 1, left: 2, right: 2 },
    borderStyle: "round",
    borderColor: borderColor(opts.variant),
    margin: { top: 1, bottom: 1, left: 0, right: 0 },
  });
}
