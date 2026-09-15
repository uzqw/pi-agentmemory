import { describe, it, expect } from "vitest";
import { HealthMonitor } from "./health.js";

describe("HealthMonitor", () => {
  it("starts in unknown state with no transition or reason", () => {
    const monitor = new HealthMonitor();
    expect(monitor.snapshot()).toEqual({
      state: "unknown",
      lastTransitionAt: null,
      failureReason: null,
    });
  });

  it("first success transitions unknown → up", () => {
    const monitor = new HealthMonitor();
    expect(monitor.report(true)).toBe(true);
    expect(monitor.state).toBe("up");
    expect(monitor.snapshot().lastTransitionAt).toBeTruthy();
  });

  it("a single failed check does not flip a healthy monitor to down", () => {
    const monitor = new HealthMonitor();
    monitor.report(true);
    expect(monitor.report(false, "timeout")).toBe(false);
    expect(monitor.state).toBe("up");
  });

  it("two consecutive failures flip to down and record the reason", () => {
    const monitor = new HealthMonitor();
    monitor.report(false, "connection refused");
    expect(monitor.report(false, "connection refused")).toBe(true);
    expect(monitor.state).toBe("down");
    expect(monitor.snapshot().failureReason).toBe("connection refused");
  });

  it("repeated failures while down update the reason without new transitions", () => {
    const monitor = new HealthMonitor();
    monitor.report(false);
    monitor.report(false);
    const at = monitor.snapshot().lastTransitionAt;
    expect(monitor.report(false, "timeout")).toBe(false);
    expect(monitor.snapshot().lastTransitionAt).toBe(at);
    expect(monitor.snapshot().failureReason).toBe("timeout");
  });

  it("one success recovers immediately and resets the failure streak", () => {
    const monitor = new HealthMonitor();
    monitor.report(false);
    monitor.report(false);
    expect(monitor.state).toBe("down");
    expect(monitor.report(true)).toBe(true); // fast recovery, no up-hysteresis
    expect(monitor.state).toBe("up");
    expect(monitor.report(false)).toBe(false); // streak is 1, below threshold
    expect(monitor.state).toBe("up");
    expect(monitor.report(false)).toBe(true); // streak hits threshold again
    expect(monitor.state).toBe("down");
  });

  it("recovery clears the reason and records a fresh transition", () => {
    const monitor = new HealthMonitor();
    monitor.report(false, "down");
    const downAt = monitor.snapshot().lastTransitionAt;
    expect(monitor.report(true)).toBe(true);
    const snap = monitor.snapshot();
    expect(snap.state).toBe("up");
    expect(snap.failureReason).toBeNull();
    expect(snap.lastTransitionAt).not.toBe(downAt);
  });

  it("honours a custom failure threshold", () => {
    const monitor = new HealthMonitor(3);
    monitor.report(false);
    monitor.report(false);
    expect(monitor.state).toBe("unknown");
    expect(monitor.report(false)).toBe(true);
    expect(monitor.state).toBe("down");
  });
});
