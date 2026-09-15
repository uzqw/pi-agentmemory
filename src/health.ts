export type HealthState = "unknown" | "up" | "down";

export interface HealthSnapshot {
  state: HealthState;
  lastTransitionAt: string | null;
  failureReason: string | null;
}

/**
 * Health state machine: unknown → up/down, tracking the timestamp of the
 * last transition and the reason for the most recent failure. Requires
 * `failureThreshold` consecutive failed checks before declaring down so one
 * flaky request doesn't flap the status line.
 */
export class HealthMonitor {
  private current: HealthState = "unknown";
  private transitionAt: string | null = null;
  private reason: string | null = null;
  private consecutiveFailures = 0;

  constructor(private readonly failureThreshold = 2) {}

  /** Record one check result; returns true when the state transitioned. */
  report(ok: boolean, reason?: string): boolean {
    this.consecutiveFailures = ok ? 0 : this.consecutiveFailures + 1;
    if (ok) {
      if (this.current === "up") return false;
      this.current = "up";
      this.reason = null;
    } else {
      if (reason) this.reason = reason;
      if (this.current === "down" || this.consecutiveFailures < this.failureThreshold) {
        return false;
      }
      this.current = "down";
    }
    this.transitionAt = new Date().toISOString();
    return true;
  }

  get state(): HealthState {
    return this.current;
  }

  snapshot(): HealthSnapshot {
    return {
      state: this.current,
      lastTransitionAt: this.transitionAt,
      failureReason: this.reason,
    };
  }
}
