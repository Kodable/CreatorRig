// Fixed-timestep accumulator, decoupling render frame rate from physics rate.
export const FIXED_DT = 1 / 60;

export class FixedStepper {
  private acc = 0;

  constructor(private readonly maxStepsPerFrame = 5) {}

  /**
   * Feed a frame's elapsed time (ms). Calls `step()` once per fixed tick that
   * has accumulated, up to `maxStepsPerFrame` per call. Returns the number of
   * steps actually taken.
   */
  update(deltaMs: number, step: () => void): number {
    const dt = deltaMs / 1000;
    // A frame within 25% of the fixed tick takes exactly one step and drops any remainder. A pure
    // accumulator on a 60 Hz display (deltas 16.6-16.8 ms) drifts and periodically takes 0 or 2
    // steps in one frame, which reads as a stutter on anything the camera follows. The clock
    // error this trades for is at most 25% of one tick on an off-rhythm frame.
    if (Math.abs(dt - FIXED_DT) <= FIXED_DT * 0.25) {
      this.acc = 0;
      step();
      return 1;
    }
    this.acc = Math.min(this.acc + dt, FIXED_DT * this.maxStepsPerFrame);
    let count = 0;
    while (this.acc >= FIXED_DT) {
      step();
      this.acc -= FIXED_DT;
      count++;
    }
    return count;
  }

  /** Fraction (0..1) of the next fixed tick already accumulated: the render interpolation factor
   * between the previous and the current physics state ("Fix Your Timestep"). */
  get alpha(): number {
    return Math.max(0, Math.min(1, this.acc / FIXED_DT));
  }

  reset(): void {
    this.acc = 0;
  }
}
