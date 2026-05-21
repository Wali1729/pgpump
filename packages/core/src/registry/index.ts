import type { AdapterInput, RenderPlan, TargetAdapter } from "../ir/types";
import { assertNoDuplicateRoutes } from "../validation/route-validator";

export class AdapterRegistry {
  private adapters = new Map<string, TargetAdapter>();

  register(adapter: TargetAdapter): void {
    if (this.adapters.has(adapter.id)) {
      throw new Error(`Adapter already registered: ${adapter.id}`);
    }
    this.adapters.set(adapter.id, adapter);
  }

  get(id: string): TargetAdapter {
    const adapter = this.adapters.get(id);
    if (!adapter) {
      throw new Error(
        `Unknown adapter "${id}". Available: ${this.list().join(", ")}`,
      );
    }
    return adapter;
  }

  list(): string[] {
    return [...this.adapters.keys()].sort();
  }

  async buildRenderPlan(
    id: string,
    input: AdapterInput,
  ): Promise<RenderPlan> {
    const adapter = this.get(id);
    const plan = await adapter.buildRenderPlan(input);
    const sorted: RenderPlan = {
      files: [...plan.files].sort((a, b) => a.path.localeCompare(b.path)),
      warnings: plan.warnings,
    };
    assertNoDuplicateRoutes(sorted);
    return sorted;
  }
}

export function createDefaultRegistry(): AdapterRegistry {
  return new AdapterRegistry();
}
