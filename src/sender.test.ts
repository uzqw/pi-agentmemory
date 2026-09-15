import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { LocalOutbox } from "./outbox.js";
import { Sender } from "./sender.js";

let dir: string;
let outbox: LocalOutbox;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "sender-test-"));
  outbox = new LocalOutbox(path.join(dir, "outbox.jsonl"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const ok = async () => true;
const fail = async () => false;

describe("Sender", () => {
  it("removes the record immediately when delivery succeeds", async () => {
    const sender = new Sender(outbox, ok);
    sender.capture({ kind: "a" });
    await new Promise((r) => setImmediate(r));
    expect(sender.queued()).toBe(0);
  });

  it("keeps the record queued when delivery fails", async () => {
    const sender = new Sender(outbox, fail);
    sender.capture({ kind: "a" });
    await new Promise((r) => setImmediate(r));
    expect(sender.queued()).toBe(1);
    expect(outbox.pending()[0].payload).toEqual({ kind: "a" });
  });

  it("persists synchronously before the async delivery resolves (crash safety)", () => {
    const sender = new Sender(outbox, () => new Promise(() => {}));
    sender.capture({ kind: "a" });
    // No await: the record must already be on disk.
    expect(outbox.count()).toBe(1);
  });

  it("flush delivers queued records and clears them", async () => {
    outbox.enqueue({ kind: "a" });
    outbox.enqueue({ kind: "b" });
    const sender = new Sender(outbox, ok);
    expect(await sender.flush()).toBe(2);
    expect(sender.queued()).toBe(0);
  });

  it("flush stops at the first failure and keeps the rest queued", async () => {
    outbox.enqueue({ kind: "a" });
    outbox.enqueue({ kind: "b" });
    outbox.enqueue({ kind: "c" });
    const payloads: unknown[] = [];
    let calls = 0;
    const sender = new Sender(outbox, async (p) => {
      payloads.push(p);
      return ++calls < 2; // first ok, then down
    });
    expect(await sender.flush()).toBe(1);
    expect(sender.queued()).toBe(2);
    expect(payloads).toEqual([{ kind: "a" }, { kind: "b" }]);
  });

  it("delivers nothing when the queue is empty", async () => {
    const sender = new Sender(outbox, ok);
    expect(await sender.flush()).toBe(0);
  });
});
