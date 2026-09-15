import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export interface OutboxRecord {
  id: string;
  enqueuedAt: string;
  payload: unknown;
}

/**
 * Append-only JSONL outbox. Records are written synchronously so an enqueue
 * survives a process crash; confirmed deliveries are removed by atomically
 * rewriting the file (temp file + rename). Torn or corrupt lines left by a
 * crash mid-append are skipped on read.
 */
export class LocalOutbox {
  readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, "");
  }

  enqueue(payload: unknown): OutboxRecord {
    this.repairTornTail();
    const record: OutboxRecord = {
      id: crypto.randomUUID(),
      enqueuedAt: new Date().toISOString(),
      payload,
    };
    // ponytail: sync write survives process crash but not power loss;
    // add fs.fsyncSync if durability across power cuts matters.
    fs.appendFileSync(this.filePath, JSON.stringify(record) + "\n");
    return record;
  }

  // A crash mid-append can leave a partial final line; terminate it so the
  // next record starts on a fresh line instead of being swallowed by it.
  private repairTornTail(): void {
    const { size } = fs.statSync(this.filePath);
    if (size === 0) return;
    const fd = fs.openSync(this.filePath, "r");
    try {
      const tail = Buffer.alloc(1);
      fs.readSync(fd, tail, 0, 1, size - 1);
      if (tail[0] !== 0x0a) fs.appendFileSync(this.filePath, "\n");
    } finally {
      fs.closeSync(fd);
    }
  }

  pending(): OutboxRecord[] {
    const raw = fs.readFileSync(this.filePath, "utf8");
    const records: OutboxRecord[] = [];
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line) as OutboxRecord;
        if (parsed && typeof parsed.id === "string" && typeof parsed.enqueuedAt === "string") {
          records.push(parsed);
        }
      } catch {
        // torn line from a crash mid-append — drop it
      }
    }
    return records;
  }

  remove(ids: Iterable<string>): void {
    const drop = new Set(ids);
    const records = this.pending();
    const kept = records.filter((r) => !drop.has(r.id));
    if (kept.length === records.length) return;
    const tmp = `${this.filePath}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, kept.map((r) => JSON.stringify(r) + "\n").join(""));
    fs.renameSync(tmp, this.filePath);
  }

  count(): number {
    return this.pending().length;
  }
}
