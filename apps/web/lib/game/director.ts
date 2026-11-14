import type { MatchView } from "../nearTypes";
import type { Beat } from "./beats";

export interface DirectorOptions {
  execute: (beat: Beat) => Promise<void>;
  onIdle?: () => void;
  onDeferredSnapshot?: (snapshot: MatchView) => void;
}

/**
 * Sequential beat queue ensuring animation phases never overlap and deferred
 * snapshots wait until the queue drains cleanly before emitting a single idle signal.
 */
export class Director {
  private readonly executeFn: (beat: Beat) => Promise<void>;
  private readonly onIdleFn?: () => void;
  private readonly onDeferredSnapshotFn?: (snapshot: MatchView) => void;

  private readonly queue: Beat[] = [];
  private pendingSnapshot: MatchView | null = null;
  private running = false;
  private disposed = false;

  constructor(options: DirectorOptions) {
    this.executeFn = options.execute;
    this.onIdleFn = options.onIdle;
    this.onDeferredSnapshotFn = options.onDeferredSnapshot;
  }

  get isBusy(): boolean {
    return this.running || this.queue.length > 0;
  }

  get pendingCount(): number {
    return this.queue.length;
  }

  enqueue(beats: Beat | readonly Beat[]): void {
    if (this.disposed) {
      return;
    }
    const list = Array.isArray(beats) ? beats : [beats];
    if (list.length === 0) {
      return;
    }
    this.queue.push(...list);
    if (!this.running) {
      void this.drain();
    }
  }

  /**
   * Applies snapshot immediately when idle; defers until queue drains when busy.
   */
  applyOrDeferSnapshot(snapshot: MatchView): boolean {
    if (this.disposed) {
      return false;
    }
    if (!this.isBusy) {
      this.onDeferredSnapshotFn?.(snapshot);
      return true;
    }
    this.pendingSnapshot = snapshot;
    return false;
  }

  clear(): void {
    this.queue.length = 0;
    this.pendingSnapshot = null;
  }

  dispose(): void {
    this.disposed = true;
    this.clear();
  }

  private async drain(): Promise<void> {
    this.running = true;
    try {
      while (!this.disposed && this.queue.length > 0) {
        const beat = this.queue.shift()!;
        await this.executeFn(beat);
      }
      if (this.disposed) {
        return;
      }
      const snap = this.pendingSnapshot;
      this.pendingSnapshot = null;
      if (snap !== null) {
        this.onDeferredSnapshotFn?.(snap);
      }
    } finally {
      this.running = false;
    }
    if (!this.disposed && this.queue.length === 0) {
      this.onIdleFn?.();
    }
  }
}
