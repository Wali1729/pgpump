import chalk from "chalk";
import gradient from "gradient-string";

export const palette = {
  primary: "#7c5cff",
  accent: "#00d4ff",
  success: "#22c55e",
  warning: "#f59e0b",
  danger: "#ef4444",
  muted: "#64748b",
};

type ColorFormatter = (value: string) => string;

export const brandGradient: ColorFormatter = gradient([palette.primary, palette.accent]);
export const successGradient: ColorFormatter = gradient([palette.accent, palette.success]);

export const c = {
  brand: (s: string) => brandGradient(s),
  accent: (s: string) => chalk.hex(palette.accent)(s),
  primary: (s: string) => chalk.hex(palette.primary)(s),
  success: (s: string) => chalk.hex(palette.success)(s),
  warning: (s: string) => chalk.hex(palette.warning)(s),
  danger: (s: string) => chalk.hex(palette.danger)(s),
  muted: (s: string) => chalk.hex(palette.muted)(s),
  bold: (s: string) => chalk.bold(s),
  dim: (s: string) => chalk.dim(s),
};

export const symbols = {
  bullet: c.muted("•"),
  arrow: c.accent("›"),
  check: c.success("✔"),
  cross: c.danger("✖"),
  warn: c.warning("⚠"),
  info: c.accent("ℹ"),
  spark: c.primary("✨"),
  rocket: "🚀",
  database: "🗄 ",
  wrench: "🔧",
  package: "📦",
  docs: "📖",
};
