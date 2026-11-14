import { sha256 } from "@noble/hashes/sha2.js";
import type { Shell } from "../nearTypes";

/**
 * Randomness / shell-draw source injected into pure game rules.
 */
export interface ShellSource {
  draw(liveUnfixed: number, blankUnfixed: number): Shell;
  roll(n: number): number;
}

/**
 * Deterministic test source returning scripted shells and rolls in order.
 */
export class ScriptedSource implements ShellSource {
  private readonly shells: readonly Shell[];
  private readonly rolls: readonly number[];
  private shellIdx = 0;
  private rollIdx = 0;

  constructor(shells: readonly Shell[], rolls: readonly number[] = []) {
    this.shells = shells;
    this.rolls = rolls;
  }

  static withRolls(shells: readonly Shell[], rolls: readonly number[]): ScriptedSource {
    return new ScriptedSource(shells, rolls);
  }

  draw(): Shell {
    const shell = this.shells[this.shellIdx];
    if (shell === undefined) {
      throw new Error("ScriptedSource: scripted shells exhausted");
    }
    this.shellIdx += 1;
    return shell;
  }

  roll(n: number): number {
    if (n <= 0) return 0;
    const v = this.rolls[this.rollIdx] ?? 0;
    this.rollIdx += 1;
    return (v >>> 0) % n;
  }
}

function normalizeSeed(seed: Uint8Array | string | number): Uint8Array {
  if (seed instanceof Uint8Array) {
    return seed;
  }
  if (typeof seed === "number") {
    const buf = new Uint8Array(32);
    const view = new DataView(buf.buffer);
    view.setBigUint64(0, BigInt(Math.trunc(seed)) & BigInt("0xffffffffffffffff"), true);
    return buf;
  }
  return new TextEncoder().encode(seed);
}

/**
 * Deterministic SHA-256 PRNG source for practice mode and simulation tests.
 */
export class SeededSource implements ShellSource {
  private readonly seedBytes: Uint8Array;
  private readonly extraBytes: Uint8Array;
  private nonce: bigint;

  constructor(
    seed: Uint8Array | string | number,
    options?: { startNonce?: bigint; extraSeed?: Uint8Array },
  ) {
    this.seedBytes = normalizeSeed(seed);
    this.extraBytes = options?.extraSeed ?? new Uint8Array(0);
    this.nonce = options?.startNonce ?? BigInt(0);
  }

  private nextU32(): number {
    const buf = new Uint8Array(this.seedBytes.length + 8 + this.extraBytes.length);
    buf.set(this.seedBytes, 0);
    const view = new DataView(buf.buffer, this.seedBytes.length, 8);
    view.setBigUint64(0, this.nonce, true);
    if (this.extraBytes.length > 0) {
      buf.set(this.extraBytes, this.seedBytes.length + 8);
    }
    this.nonce += BigInt(1);
    const h = sha256(buf);
    return new DataView(h.buffer, h.byteOffset, 4).getUint32(0, false);
  }

  draw(liveUnfixed: number, blankUnfixed: number): Shell {
    const total = liveUnfixed + blankUnfixed;
    if (total <= 0) return "Blank";
    const r = this.nextU32();
    return r % total < liveUnfixed ? "Live" : "Blank";
  }

  roll(n: number): number {
    if (n <= 0) return 0;
    return this.nextU32() % n;
  }
}
