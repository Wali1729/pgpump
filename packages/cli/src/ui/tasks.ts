import * as p from "@clack/prompts";
import { c, symbols } from "./theme";

export interface Phase {
  id: string;
  label: string;
}

export class PhaseRunner {
  private spinner = p.spinner();
  private current?: Phase;
  private completed: string[] = [];

  start(initial: Phase): void {
    this.current = initial;
    this.spinner.start(this.format(initial));
  }

  advance(next: Phase): void {
    if (this.current) {
      this.completed.push(this.current.label);
    }
    this.current = next;
    this.spinner.message(this.format(next));
  }

  succeed(message: string): void {
    this.spinner.stop(`${symbols.check} ${c.success(message)}`);
  }

  fail(message: string): void {
    this.spinner.stop(`${symbols.cross} ${c.danger(message)}`, 1);
  }

  private format(phase: Phase): string {
    const trail = this.completed.length
      ? c.muted(` (${this.completed.length} done)`)
      : "";
    return `${c.accent(phase.label)}${trail}`;
  }
}
