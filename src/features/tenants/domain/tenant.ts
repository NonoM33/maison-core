import type { ConciergeConfig } from "./concierge-config.ts";
import type { ThemeTokens } from "./theme-tokens.ts";

export type TenantStatus = "pending" | "active" | "suspended";
export type TenantDbStrategy = "shared" | "dedicated";

export interface Tenant {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly status: TenantStatus;
  readonly dbStrategy: TenantDbStrategy;
  readonly themeTokens: ThemeTokens;
  readonly featureFlags: Readonly<Record<string, boolean>>;
  readonly conciergeConfig: ConciergeConfig | null;
}

export function isFeatureEnabled(tenant: Tenant, flag: string): boolean {
  return tenant.featureFlags[flag] === true;
}

export function isActive(tenant: Tenant): boolean {
  return tenant.status === "active";
}
