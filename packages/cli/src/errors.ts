import chalk from "chalk";

export function sanitizeConnectionString(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = "***";
    return u.toString();
  } catch {
    return "[invalid-url]";
  }
}

export function printError(message: string, detail?: string): void {
  console.error(chalk.red.bold("Error:"), chalk.red(message));
  if (detail) console.error(chalk.dim(detail));
}

export function printSuccess(message: string): void {
  console.log(chalk.green("✔"), message);
}
