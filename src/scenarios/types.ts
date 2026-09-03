import type Phaser from 'phaser';
import type { RigParams } from '../params';
import type { FrameStats } from '../report';

/** What a scenario hands back after it has built its world inside the Phaser scene. */
export interface ScenarioHandle {
  /** Called once per Phaser update with the delta in ms. Optional for static scenes. */
  update?(deltaMs: number, timeMs: number): void;
  /**
   * Decide pass or fail from the frame stats. Return null when the scenario has no
   * automatic rule (for example a hash that a human compares across devices).
   */
  pass?(stats: FrameStats): boolean | null;
  /** Scenario-specific numbers for the report: hashes, counts, latencies. */
  extra?(): Record<string, unknown>;
  /** Free-text observations for the report. */
  notes?(): string[];
  /** Text for the top-right hash box. Shown large so a human can compare devices. */
  hash?(): string | null;
  /**
   * True while the scenario still has fixed work to finish (a step count, a rerun). The measured
   * window extends past `duration` until this returns false or the cap is reached, so a slow
   * device does not need a hand-tuned duration.
   */
  busy?(): boolean;
}

export interface Scenario {
  id: string;
  /** Default count when the URL gives none. */
  defaultCount: number;
  /** Build the world. Runs inside Phaser's Scene.create. */
  create(scene: Phaser.Scene, params: RigParams): ScenarioHandle | Promise<ScenarioHandle>;
}

/** Deterministic PRNG (mulberry32). Every random choice in a scenario goes through this. */
export function makeRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
