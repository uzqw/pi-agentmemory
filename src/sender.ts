import { LocalOutbox } from "./outbox.js";

export type DeliverFn = (payload: unknown) => Promise<boolean>;

/**
 * Outbox-first delivery: every capture is persisted synchronously, then
 * delivered in the background; confirmed deliveries are removed from the
 * outbox. A crash between capture and delivery loses nothing — the record is
 * already on disk and flush() retries it later.
 */
export class Sender {
  private flushing = false;

  constructor(
    private readonly outbox: LocalOutbox,
    private readonly deliver: DeliverFn,
  ) {}

  /** Persist, then deliver in the background. Never throws. */
  capture(payload: unknown): void {
    let record;
    try {
      record = this.outbox.enqueue(payload);
    } catch {
      return; // disk full etc. — nothing more we can do without a session stall
    }
    void this.deliver(payload)
      .then((ok) => {
        if (ok) this.outbox.remove([record.id]);
      })
      .catch(() => {
        // stays queued for the next flush
      });
  }

  /** Deliver pending records in order; stop at the first failure. */
  async flush(): Promise<number> {
    // ponytail: a flush trigger arriving mid-flush is dropped on purpose —
    // the in-flight flush plus per-capture self-delivery already cover the queue.
    if (this.flushing) return 0;
    this.flushing = true;
    const delivered: string[] = [];
    try {
      for (const record of this.outbox.pending()) {
        if (!(await this.deliver(record.payload))) break;
        delivered.push(record.id);
      }
    } finally {
      this.flushing = false;
      if (delivered.length) this.outbox.remove(delivered);
    }
    return delivered.length;
  }

  queued(): number {
    return this.outbox.count();
  }
}
