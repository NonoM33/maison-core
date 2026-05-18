export interface ConciergeSession {
  readonly id: string;
  readonly tenantId: string;
  readonly visitorId: string;
  readonly page: string | null;
  readonly startedAt: Date;
  readonly lastActivityAt: Date;
}
