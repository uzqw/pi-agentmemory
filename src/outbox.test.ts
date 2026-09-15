import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { LocalOutbox } from "./outbox.js";

let dir: string;
let outbox: LocalOutbox;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "outbox-test-"));
  outbox = new LocalOutbox(path.join(dir, "outbox.jsonl"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("LocalOutbox", () => {
  it("appends records in order and reads them back", () => {
    const a = outbox.enqueue({ kind: "a" });
    const b = outbox.enqueue({ kind: "b" });
    const pending = outbox.pending();
    expect(pending.map((r) => r.id)).toEqual([a.id, b.id]);
    expect(pending[0].payload).toEqual({ kind: "a" });
    expect(pending[1].payload).toEqual({ kind: "b" });
    expect(outbox.count()).toBe(2);
  });

  it("gives every record a unique id and ISO timestamp", () => {
    const a = outbox.enqueue({});
    const b = outbox.enqueue({});
    expect(a.id).not.toBe(b.id);
    expect(Number.isNaN(Date.parse(a.enqueuedAt))).toBe(false);
  });

  it("survives process restart (records persist on disk)", () => {
    outbox.enqueue({ kind: "a" });
    outbox.enqueue({ kind: "b" });
    const reopened = new LocalOutbox(outbox.filePath);
    expect(reopened.count()).toBe(2);
  });

  it("skips torn/corrupt lines from a crash mid-append", () => {
    outbox.enqueue({ kind: "a" });
    fs.appendFileSync(outbox.filePath, '{"id":"half","enqueuedAt":');
    outbox.enqueue({ kind: "b" });
    const pending = outbox.pending();
    expect(pending.map((r) => (r.payload as { kind: string }).kind)).toEqual(["a", "b"]);
  });

  it("removes only confirmed records via atomic rewrite", () => {
    const a = outbox.enqueue({ kind: "a" });
    outbox.enqueue({ kind: "b" });
    const c = outbox.enqueue({ kind: "c" });
    outbox.remove([a.id, c.id]);
    const pending = outbox.pending();
    expect(pending.map((r) => (r.payload as { kind: string }).kind)).toEqual(["b"]);
    expect(outbox.count()).toBe(1);
    // reopen to prove the rewrite landed durably
    expect(new LocalOutbox(outbox.filePath).count()).toBe(1);
  });

  it("no-ops remove with unknown ids", () => {
    outbox.enqueue({ kind: "a" });
    outbox.remove(["nope"]);
    expect(outbox.count()).toBe(1);
  });

  it("constructor creates the file and parent dirs when missing", () => {
    const nested = new LocalOutbox(path.join(dir, "deep", "nest", "outbox.jsonl"));
    expect(fs.existsSync(nested.filePath)).toBe(true);
    nested.enqueue({ x: 1 });
    expect(nested.count()).toBe(1);
  });
});
